import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import {
  listAgentJobs,
  createAgentJob,
  pauseAgentJob,
  resumeAgentJob,
  cancelAgentJob,
  toChainId,
  recurringJobType,
  conditionalJobType,
  priceAboveCondition,
  priceBelowCondition,
  swapJobAction,
} from "../agent-client.js";
import { agentToResult, jsonResult, requireAgentWallet } from "./_helpers.js";

const ACTIONS = ["list", "create", "pause", "resume", "delete"] as const;
const JOB_TYPES = ["recurring", "oneshot", "conditional"] as const;

export function createJobsTool(_config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_jobs",
    label: "Menese Jobs",
    description:
      "Manage scheduled jobs on your MeneseAgent canister. Requires an agent canister (run /deploy-agent first).\n\n" +
      "Actions:\n" +
      "- 'list': show all jobs\n" +
      "- 'create': create a new recurring or conditional job\n" +
      "- 'pause'/'resume'/'delete': manage existing jobs by jobId",
    parameters: Type.Object({
      action: stringEnum([...ACTIONS], {
        description: "Job operation to perform",
      }),
      // -- Create params --
      name: Type.Optional(Type.String({ description: "Job name (required for create)" })),
      description: Type.Optional(Type.String({ description: "Job description (required for create)" })),
      jobType: Type.Optional(stringEnum([...JOB_TYPES], {
        description: "Job type (required for create): recurring, oneshot, conditional",
      })),
      intervalSeconds: Type.Optional(Type.Number({
        description: "Interval for recurring jobs in seconds (e.g. 86400=daily, 604800=weekly)",
        minimum: 60,
      })),
      // -- Swap action params --
      chain: Type.Optional(Type.String({ description: "Chain for the swap action" })),
      fromToken: Type.Optional(Type.String({ description: "Token to sell" })),
      toToken: Type.Optional(Type.String({ description: "Token to buy" })),
      amount: Type.Optional(Type.String({ description: "Amount per execution (decimal string)" })),
      slippageBps: Type.Optional(Type.Number({ description: "Max slippage in basis points (default: 250)", minimum: 1, maximum: 5000 })),
      // -- Condition params --
      conditionType: Type.Optional(stringEnum(["price_above", "price_below"] as const, {
        description: "Condition type for conditional jobs",
      })),
      conditionToken: Type.Optional(Type.String({ description: "Token symbol for price condition" })),
      conditionThreshold: Type.Optional(Type.String({ description: "Price threshold in USD (e.g. '70000')" })),
      checkIntervalSeconds: Type.Optional(Type.Number({ description: "How often to check condition (default: 300 = 5min)", minimum: 60 })),
      // -- Safety --
      allowFundMovement: Type.Optional(Type.Boolean({ description: "Allow fund-moving operations (default: false)" })),
      maxExecutions: Type.Optional(Type.Number({ description: "Max executions before auto-stopping", minimum: 1 })),
      // -- Manage --
      jobId: Type.Optional(Type.Number({ description: "Job ID (required for pause/resume/delete)" })),
    }),
    async execute(
      _toolCallId: string,
      params: {
        action: string;
        name?: string;
        description?: string;
        jobType?: string;
        intervalSeconds?: number;
        chain?: string;
        fromToken?: string;
        toToken?: string;
        amount?: string;
        slippageBps?: number;
        conditionType?: string;
        conditionToken?: string;
        conditionThreshold?: string;
        checkIntervalSeconds?: number;
        allowFundMovement?: boolean;
        maxExecutions?: number;
        jobId?: number;
      },
    ) {
      const wallet = requireAgentWallet(store);
      if ("error" in wallet) return wallet.error;

      switch (params.action) {
        case "list": {
          const res = await listAgentJobs(wallet.agentCanisterId, wallet.seed);
          return agentToResult(res);
        }

        case "pause": {
          if (params.jobId == null) return jsonResult({ error: "Missing required parameter: jobId" });
          const res = await pauseAgentJob(wallet.agentCanisterId, wallet.seed, params.jobId);
          return agentToResult(res);
        }

        case "resume": {
          if (params.jobId == null) return jsonResult({ error: "Missing required parameter: jobId" });
          const res = await resumeAgentJob(wallet.agentCanisterId, wallet.seed, params.jobId);
          return agentToResult(res);
        }

        case "delete": {
          if (params.jobId == null) return jsonResult({ error: "Missing required parameter: jobId" });
          const res = await cancelAgentJob(wallet.agentCanisterId, wallet.seed, params.jobId);
          return agentToResult(res);
        }

        case "create": {
          if (!params.name) return jsonResult({ error: "Missing required parameter: name" });
          if (!params.jobType) return jsonResult({ error: "Missing required parameter: jobType" });
          if (!params.chain) return jsonResult({ error: "Missing required parameter: chain" });
          if (!params.fromToken || !params.toToken || !params.amount) {
            return jsonResult({ error: "Missing swap parameters: chain, fromToken, toToken, amount" });
          }

          const chainId = toChainId(params.chain);
          if (!chainId) return jsonResult({ error: `Unsupported chain: ${params.chain}` });

          // Parse amount to smallest unit
          const amountRaw = parseAmount(params.amount, params.chain);
          const slippage = params.slippageBps ?? 250;

          // Build job action (swap)
          const action = swapJobAction(params.chain, params.fromToken, params.toToken, amountRaw, slippage);

          // Build job type
          let jobType: unknown;
          if (params.jobType === "recurring") {
            if (!params.intervalSeconds) return jsonResult({ error: "Recurring job requires intervalSeconds" });
            jobType = recurringJobType(params.intervalSeconds);
          } else if (params.jobType === "conditional") {
            if (!params.conditionType || !params.conditionToken || !params.conditionThreshold) {
              return jsonResult({ error: "Conditional job requires conditionType, conditionToken, conditionThreshold" });
            }
            const thresholdMicro = Math.round(parseFloat(params.conditionThreshold) * 1_000_000);
            const condition = params.conditionType === "price_above"
              ? priceAboveCondition(params.conditionToken, thresholdMicro)
              : priceBelowCondition(params.conditionToken, thresholdMicro);
            jobType = conditionalJobType(params.checkIntervalSeconds ?? 300, condition);
          } else if (params.jobType === "oneshot") {
            jobType = { OneShot: { executeAt: BigInt(Date.now()) * 1_000_000n } }; // now (nanoseconds)
          } else {
            return jsonResult({ error: `Unknown jobType: ${params.jobType}` });
          }

          const res = await createAgentJob(wallet.agentCanisterId, wallet.seed, {
            name: params.name,
            description: params.description ?? "",
            jobType,
            action,
            allowFundMovement: params.allowFundMovement ?? false,
            maxExecutions: params.maxExecutions,
          });
          return agentToResult(res);
        }

        default:
          return jsonResult({ error: `Unknown action: ${params.action}` });
      }
    },
  };
}

/** Convert a decimal amount string to the chain's smallest unit. */
function parseAmount(amount: string, chain: string): bigint {
  const parts = amount.split(".");
  const whole = parts[0] ?? "0";
  let frac = parts[1] ?? "";

  const evmChains = ["ethereum", "polygon", "arbitrum", "base", "optimism", "bnb"];
  let decimals: number;
  if (evmChains.includes(chain)) decimals = 18;
  else if (chain === "solana") decimals = 9;
  else if (chain === "xrp") decimals = 6;
  else if (chain === "bitcoin" || chain === "litecoin" || chain === "icp") decimals = 8;
  else if (chain === "sui" || chain === "ton") decimals = 9;
  else decimals = 8;

  if (frac.length > decimals) frac = frac.slice(0, decimals);
  frac = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
}
