import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS, EVM_CHAINS } from "../chains.js";
import { addStrategy, listStrategies, deleteStrategy, getStrategyLogs, updateStrategyStatus } from "../ic-client.js";
import {
  createAgentJob,
  listAgentJobs,
  cancelAgentJob,
  recurringJobType,
  conditionalJobType,
  priceAboveCondition,
  priceBelowCondition,
  swapJobAction,
} from "../agent-client.js";
import { writeToResult, agentToResult, jsonResult, cardResult, requireAuthenticatedWallet, hasAgent, requireAgentWallet } from "./_helpers.js";

const ACTIONS = ["create", "list", "cancel", "logs", "pause", "resume"] as const;
const STRATEGY_TYPES = ["dca", "take_profit", "stop_loss"] as const;

/** Map our chain strings to SDK ChainType variants. */
const CHAIN_TYPE_MAP: Record<string, Record<string, null>> = {
  ethereum: { Ethereum: null },
  polygon: { Polygon: null },
  arbitrum: { Arbitrum: null },
  base: { Base: null },
  optimism: { Optimism: null },
  bnb: { BNB: null },
  bitcoin: { Bitcoin: null },
  litecoin: { Litecoin: null },
  solana: { Solana: null },
  sui: { Sui: null },
  ton: { TON: null },
  xrp: { XRP: null },
  icp: { ICP: null },
  cloakcoin: { CloakCoin: null },
  thorchain: { Thorchain: null },
};

/** Map strategy types to SDK RuleType variants. */
const RULE_TYPE_MAP: Record<string, Record<string, null>> = {
  dca: { DCA: null },
  take_profit: { TakeProfit: null },
  stop_loss: { StopLoss: null },
};

export function createStrategyTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_strategy",
    label: "Menese Strategy",
    description:
      "Create and manage automated trading strategies on the SDK canister.\n\n" +
      "Strategy types:\n" +
      "- 'dca': Dollar-cost average — buy a token at regular intervals\n" +
      "- 'take_profit': Sell when price rises above a target\n" +
      "- 'stop_loss': Sell when price drops below a threshold\n\n" +
      "For 'create': provide strategyType, chain, amount, and relevant params.\n" +
      "For 'list': shows all active strategy rules.\n" +
      "For 'cancel': provide ruleId to delete a strategy.\n" +
      "For 'logs': shows execution logs for all strategies.\n" +
      "For 'pause': provide ruleId to pause a strategy.\n" +
      "For 'resume': provide ruleId to resume a paused strategy.\n" +
      "Requires a wallet (run /setup first).\n\n" +
      "IMPORTANT: Results are already formatted. Display them exactly as returned inside a code block. " +
      "Do NOT reformat, add emojis, or build tables. Never silently complete.",
    parameters: Type.Object({
      action: stringEnum([...ACTIONS], {
        description: "'create' a new strategy, 'list' active strategies, 'cancel' by ruleId, 'logs' for execution history, 'pause'/'resume' by ruleId",
      }),
      strategyType: Type.Optional(stringEnum([...STRATEGY_TYPES], {
        description: "Strategy type (required for 'create')",
      })),
      chain: Type.Optional(stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain to execute on (required for 'create')",
      })),
      amount: Type.Optional(Type.String({
        description: "Amount per execution (as a decimal string). Required for 'create'.",
      })),
      // -- DCA-specific --
      intervalSeconds: Type.Optional(Type.Number({
        description: "Interval between DCA executions in seconds (e.g. 604800 = weekly, 86400 = daily). Required for 'dca'.",
        minimum: 60,
      })),
      maxExecutions: Type.Optional(Type.Number({
        description: "Max number of executions before auto-stopping. Omit for unlimited.",
        minimum: 1,
      })),
      // -- Price-trigger specific --
      targetPrice: Type.Optional(Type.String({
        description: "Target price in USD (e.g. '90' for $90, '150.50' for $150.50). Required for take_profit, stop_loss.",
      })),
      // -- Cancel --
      ruleId: Type.Optional(Type.Number({
        description: "Rule ID to cancel (required for 'cancel')",
      })),
    }),
    async execute(
      _toolCallId: string,
      params: {
        action: string;
        strategyType?: string;
        chain?: string;
        amount?: string;
        intervalSeconds?: number;
        maxExecutions?: number;
        targetPrice?: string;
        ruleId?: number;
      },
    ) {
      const wallet = requireAuthenticatedWallet(store);
      if ("error" in wallet) return wallet.error;

      switch (params.action) {
        case "list": {
          // When agent is connected, show both agent jobs and SDK rules
          if (hasAgent(store)) {
            const agentWallet = requireAgentWallet(store);
            if ("error" in agentWallet) return agentWallet.error;
            const [agentRes, sdkRes] = await Promise.all([
              listAgentJobs(agentWallet.agentCanisterId, agentWallet.seed),
              listStrategies(config, wallet.seed),
            ]);
            return jsonResult({
              agentJobs: agentRes.ok ? agentRes.data : [],
              sdkRules: sdkRes.ok ? sdkRes.data : [],
              source: "agent + sdk",
            });
          }
          const res = await listStrategies(config, wallet.seed);
          if (res.ok) {
            const rules = (res.data as RawRule[]).map(formatRule);
            return cardResult(fmtList(rules), { strategies: rules, count: rules.length });
          }
          return writeToResult(res);
        }

        case "cancel": {
          if (params.ruleId == null) return jsonResult({ error: "Missing required parameter: ruleId" });
          // Try agent first if connected, then SDK
          if (hasAgent(store)) {
            const agentWallet = requireAgentWallet(store);
            if (!("error" in agentWallet)) {
              const agentRes = await cancelAgentJob(agentWallet.agentCanisterId, agentWallet.seed, params.ruleId);
              if (agentRes.ok) return agentToResult(agentRes);
              // Fall through to SDK if agent didn't have this job
            }
          }
          const res = await deleteStrategy(config, wallet.seed, params.ruleId);
          return writeToResult(res);
        }

        case "create": {
          if (!params.strategyType) return jsonResult({ error: "Missing required parameter: strategyType" });
          if (!params.chain) return jsonResult({ error: "Missing required parameter: chain" });
          if (!params.amount) return jsonResult({ error: "Missing required parameter: amount" });

          const chainType = CHAIN_TYPE_MAP[params.chain];
          if (!chainType) return jsonResult({ error: `Unsupported chain: ${params.chain}` });

          const ruleType = RULE_TYPE_MAP[params.strategyType];
          if (!ruleType) return jsonResult({ error: `Unknown strategy type: ${params.strategyType}` });

          // Build the Rule record for the SDK canister
          const evmChains = EVM_CHAINS as readonly string[];
          const amountRaw = parseAmount(params.amount, params.chain, evmChains);

          const rule: Record<string, unknown> = {
            id: 0n,
            ruleType,
            chainType,
            status: { Active: null },
            positionId: 0n,
            sizePct: 100n,
            triggerPrice: params.targetPrice ? BigInt(Math.round(parseFloat(params.targetPrice) * 1_000_000)) : 0n,
            createdAt: BigInt(Date.now()) * 1_000_000n, // nanoseconds
            swapAmountWei: evmChains.includes(params.chain) ? [amountRaw] : [],
            swapAmountLamports: params.chain === "solana" ? [amountRaw] : [],
            swapAmountDrops: params.chain === "xrp" ? [amountRaw] : [],
            dcaConfig: params.strategyType === "dca" && params.intervalSeconds
              ? [{ intervalSeconds: BigInt(params.intervalSeconds), maxExecutions: params.maxExecutions ? [BigInt(params.maxExecutions)] : [] }]
              : [],
            apyMigrationConfig: [],
            lpConfig: [],
            scheduledConfig: [],
            volatilityConfig: [],
          };

          // Validate strategy-specific params
          if (params.strategyType === "dca" && !params.intervalSeconds) {
            return jsonResult({ error: "DCA strategy requires intervalSeconds (e.g. 604800 for weekly)" });
          }
          if ((params.strategyType === "take_profit" || params.strategyType === "stop_loss") && !params.targetPrice) {
            return jsonResult({ error: `${params.strategyType} strategy requires targetPrice (USD)` });
          }

          // Route through agent canister if connected (on-chain scheduler)
          if (hasAgent(store)) {
            const agentWallet = requireAgentWallet(store);
            if (!("error" in agentWallet)) {
              const agentRes = await createStrategyAsAgentJob(agentWallet, params, amountRaw);
              if (agentRes) return agentRes;
              // Fall through to SDK if agent job creation failed
            }
          }

          const res = await addStrategy(config, wallet.seed, rule);
          if (res.ok) {
            const detail = {
              success: true,
              ruleId: res.data,
              strategyType: params.strategyType,
              chain: params.chain,
              amount: params.amount,
              targetPrice: params.targetPrice ?? null,
              intervalSeconds: params.intervalSeconds ?? null,
            };
            return cardResult(fmtCreate(detail), detail);
          }
          return writeToResult(res);
        }

        case "logs": {
          const logsRes = await getStrategyLogs(config, wallet.seed);
          if (!logsRes.ok) return writeToResult(logsRes);
          const logs = (logsRes.data as RawLog[]).map(formatLog);
          return cardResult(fmtLogs(logs), { logs, count: logs.length });
        }

        case "pause": {
          if (params.ruleId == null) return jsonResult({ error: "Missing required parameter: ruleId" });
          const pauseRes = await updateStrategyStatus(config, wallet.seed, params.ruleId, "paused");
          if (!pauseRes.ok) return writeToResult(pauseRes);
          return cardResult(`STRATEGY #${params.ruleId}\n${"─".repeat(30)}\nStatus: Paused`, { success: true, ruleId: params.ruleId, newStatus: "Paused" });
        }

        case "resume": {
          if (params.ruleId == null) return jsonResult({ error: "Missing required parameter: ruleId" });
          const resumeRes = await updateStrategyStatus(config, wallet.seed, params.ruleId, "active");
          if (!resumeRes.ok) return writeToResult(resumeRes);
          return cardResult(`STRATEGY #${params.ruleId}\n${"─".repeat(30)}\nStatus: Active`, { success: true, ruleId: params.ruleId, newStatus: "Active" });
        }

        default:
          return jsonResult({ error: `Unknown action: ${params.action}` });
      }
    },
  };
}

/** Map a strategy create request to an agent job. Returns tool result or null on failure. */
async function createStrategyAsAgentJob(
  agentWallet: { agentCanisterId: string; seed: string },
  params: { strategyType?: string; chain?: string; amount?: string; intervalSeconds?: number; targetPrice?: string; maxExecutions?: number },
  amountRaw: bigint,
) {
  try {
    const chain = params.chain!;
    // For DCA we swap native → USDC as a sensible default; for TP/SL we swap USDC → native
    const fromToken = params.strategyType === "dca" ? "native" : "USDC";
    const toToken = params.strategyType === "dca" ? "USDC" : "native";
    const slippage = 250; // 2.5%

    const action = swapJobAction(chain, fromToken, toToken, amountRaw, slippage);

    let jobType: unknown;
    let name: string;

    if (params.strategyType === "dca") {
      jobType = recurringJobType(params.intervalSeconds!);
      name = `DCA ${params.amount} on ${chain} every ${params.intervalSeconds}s`;
    } else if (params.strategyType === "take_profit") {
      const thresholdMicro = Math.round(parseFloat(params.targetPrice!) * 1_000_000);
      const condition = priceAboveCondition(toToken, thresholdMicro);
      jobType = conditionalJobType(300, condition);
      name = `Take Profit on ${chain} above $${params.targetPrice}`;
    } else {
      // stop_loss
      const thresholdMicro = Math.round(parseFloat(params.targetPrice!) * 1_000_000);
      const condition = priceBelowCondition(fromToken, thresholdMicro);
      jobType = conditionalJobType(300, condition);
      name = `Stop Loss on ${chain} below $${params.targetPrice}`;
    }

    const res = await createAgentJob(agentWallet.agentCanisterId, agentWallet.seed, {
      name,
      description: `Auto-created from ${params.strategyType} strategy`,
      jobType,
      action,
      allowFundMovement: true,
      maxExecutions: params.maxExecutions,
    });

    if (res.ok) return agentToResult(res);
    // Return null to fall through to SDK
    return null;
  } catch {
    return null;
  }
}

/** Convert a decimal amount string to the chain's smallest unit. */
function parseAmount(amount: string, chain: string, evmChains: readonly string[]): bigint {
  const parts = amount.split(".");
  const whole = parts[0] ?? "0";
  let frac = parts[1] ?? "";

  let decimals: number;
  if (evmChains.includes(chain)) decimals = 18;
  else if (chain === "solana") decimals = 9;
  else if (chain === "xrp") decimals = 6;
  else if (chain === "bitcoin" || chain === "litecoin" || chain === "icp") decimals = 8;
  else if (chain === "sui" || chain === "ton") decimals = 9;
  else decimals = 8; // fallback

  if (frac.length > decimals) frac = frac.slice(0, decimals);
  frac = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
}

/** Raw execution log shape from the canister. */
interface RawLog {
  error: [string] | [];
  intent_hash: string;
  rule_id: string;
  stage: Record<string, null>;
  ts: string | bigint;
  tx_id: [string] | [];
}

/** Convert a raw execution log into a human-readable object. */
function formatLog(raw: RawLog) {
  const tsNano = BigInt(raw.ts);
  const tsMs = Number(tsNano / 1_000_000n);
  return {
    ruleId: raw.rule_id,
    stage: variantKey(raw.stage),
    timestamp: new Date(tsMs).toISOString(),
    intentHash: raw.intent_hash || null,
    txId: raw.tx_id?.[0] ?? null,
    error: raw.error?.[0] ?? null,
  };
}

/** Raw rule shape from the canister (Candid variant fields). */
interface RawRule {
  id: string | bigint;
  status: Record<string, null>;
  ruleType: Record<string, null>;
  chainType: Record<string, null>;
  triggerPrice: string | bigint;
  swapAmountLamports: (string | bigint)[];
  swapAmountWei: (string | bigint)[];
  swapAmountDrops: (string | bigint)[];
  dcaConfig: unknown[];
  createdAt: string | bigint;
  [key: string]: unknown;
}

/** Extract the first key from a Candid variant like {TakeProfit: null} → "TakeProfit". */
function variantKey(v: Record<string, null> | undefined): string {
  if (!v) return "unknown";
  return Object.keys(v)[0] ?? "unknown";
}

/** Convert a raw canister rule into a human-readable object. */
function formatRule(raw: RawRule) {
  const triggerPrice = Number(raw.triggerPrice);
  const triggerUsd = triggerPrice > 0 ? triggerPrice / 1_000_000 : null;
  const amount =
    raw.swapAmountLamports?.[0] ? `${Number(raw.swapAmountLamports[0]) / 1e9} SOL` :
    raw.swapAmountWei?.[0] ? `${Number(raw.swapAmountWei[0]) / 1e18} ETH` :
    raw.swapAmountDrops?.[0] ? `${Number(raw.swapAmountDrops[0]) / 1e6} XRP` :
    "n/a";

  return {
    id: Number(raw.id),
    type: variantKey(raw.ruleType),
    chain: variantKey(raw.chainType),
    status: variantKey(raw.status),
    triggerPriceUsd: triggerUsd ? `$${triggerUsd.toFixed(2)}` : null,
    amount,
    hasDca: raw.dcaConfig?.length > 0,
  };
}

// ── Text formatters ──────────────────────────────────────────────────

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function fmtList(rules: ReturnType<typeof formatRule>[]): string {
  if (rules.length === 0) return "STRATEGIES\n" + "─".repeat(40) + "\nNo active strategies.";
  const lines: string[] = ["STRATEGIES"];
  lines.push("─".repeat(50));
  lines.push(`${pad("ID", 5)}${pad("Type", 14)}${pad("Chain", 10)}${pad("Status", 10)}${pad("Trigger", 10)}Amount`);
  lines.push("─".repeat(50));
  for (const r of rules) {
    lines.push(`${pad("#" + r.id, 5)}${pad(r.type, 14)}${pad(r.chain, 10)}${pad(r.status, 10)}${pad(r.triggerPriceUsd ?? "—", 10)}${r.amount}`);
  }
  lines.push("─".repeat(50));
  lines.push(`${rules.length} strategy(s)`);
  return lines.join("\n");
}

function fmtCreate(d: { ruleId: unknown; strategyType?: string; chain?: string; amount?: string; targetPrice?: string | null; intervalSeconds?: number | null }): string {
  const lines: string[] = [`STRATEGY CREATED — Rule #${d.ruleId}`];
  lines.push("─".repeat(35));
  lines.push(`Type:     ${d.strategyType}`);
  lines.push(`Chain:    ${d.chain}`);
  lines.push(`Amount:   ${d.amount}`);
  if (d.targetPrice) lines.push(`Trigger:  $${d.targetPrice}`);
  if (d.intervalSeconds) lines.push(`Interval: ${d.intervalSeconds}s`);
  lines.push(`Status:   Active`);
  return lines.join("\n");
}

function fmtLogs(logs: ReturnType<typeof formatLog>[]): string {
  if (logs.length === 0) return "EXECUTION LOGS\n" + "─".repeat(40) + "\nNo logs yet.";
  const lines: string[] = ["EXECUTION LOGS"];
  lines.push("─".repeat(60));
  for (const l of logs) {
    const ts = l.timestamp.replace("T", " ").slice(0, 19);
    lines.push(`[${ts}] Rule #${l.ruleId}  ${l.stage}`);
    if (l.txId) lines.push(`  tx: ${l.txId}`);
    if (l.error) lines.push(`  err: ${l.error}`);
  }
  lines.push("─".repeat(60));
  lines.push(`${logs.length} log(s)`);
  return lines.join("\n");
}

