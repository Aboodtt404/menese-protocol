/**
 * Direct IC canister client — calls MeneseSDK canister methods via @dfinity/agent.
 *
 * Two modes:
 * - Anonymous: for public read queries (getEvmAddressFor, balances)
 * - Authenticated: for write operations (send, swap, bridge, strategy)
 *   using a per-user Ed25519 identity stored as a 32-byte hex seed.
 */

import { HttpAgent, Actor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import * as crypto from "node:crypto";
import type { MeneseConfig } from "./config.js";
import { EVM_CHAINS, type EvmChain } from "./chains.js";

// ── Candid Types ─────────────────────────────────────────────────────

const EvmAddressInfo = IDL.Record({
  evmAddress: IDL.Text,
  publicKeyHex: IDL.Text,
});

const SolanaAddressInfo = IDL.Record({
  address: IDL.Text,
  publicKeyBytes: IDL.Vec(IDL.Nat8),
  publicKeyHex: IDL.Text,
});

const AddressInfo = IDL.Record({
  bech32Address: IDL.Text,
  hash160Hex: IDL.Text,
});

const TonAddressInfo = IDL.Record({
  bounceable: IDL.Text,
  nonBounceable: IDL.Text,
  publicKeyHex: IDL.Text,
  rawAddress: IDL.Text,
});

const XrpAddressInfo = IDL.Record({
  accountIdBytes: IDL.Vec(IDL.Nat8),
  accountIdHex: IDL.Text,
  classicAddress: IDL.Text,
  publicKeyHex: IDL.Text,
});

const SuiAddressInfo = IDL.Record({
  publicKeyBytes: IDL.Vec(IDL.Nat8),
  publicKeyHex: IDL.Text,
  suiAddress: IDL.Text,
});

const CloakAddressInfo = IDL.Record({
  addressBytesHex: IDL.Text,
  base58Address: IDL.Text,
  hash160Hex: IDL.Text,
  pubKeyHex: IDL.Text,
});

const ResultNat64 = IDL.Variant({ ok: IDL.Nat64, err: IDL.Text });
const ResultText = IDL.Variant({ ok: IDL.Text, err: IDL.Text });
const ResultNat = IDL.Variant({ ok: IDL.Nat, err: IDL.Text });
const ResultVoid = IDL.Variant({ ok: IDL.Null, err: IDL.Text });
const Balance = IDL.Record({ amount: IDL.Nat, denom: IDL.Text });

// Generic send result shapes (all follow { ok: Record, err: Text })
const SendResultGeneric = IDL.Variant({
  ok: IDL.Record({ txHash: IDL.Opt(IDL.Text) }),
  err: IDL.Text,
});

// Swap result
const SwapResult = IDL.Variant({
  ok: IDL.Record({
    amountIn: IDL.Nat,
    amountOut: IDL.Nat,
    txHash: IDL.Opt(IDL.Text),
  }),
  err: IDL.Text,
});

// Strategy Rule types
const ChainType = IDL.Variant({
  Bitcoin: IDL.Null, Litecoin: IDL.Null, Ethereum: IDL.Null,
  Arbitrum: IDL.Null, Base: IDL.Null, Polygon: IDL.Null,
  BNB: IDL.Null, Optimism: IDL.Null, Solana: IDL.Null,
  Sui: IDL.Null, TON: IDL.Null, Tron: IDL.Null,
  XRP: IDL.Null, Aptos: IDL.Null, Cardano: IDL.Null,
  NEAR: IDL.Null, ICP: IDL.Null, CloakCoin: IDL.Null,
  Thorchain: IDL.Null,
});

const RuleType = IDL.Variant({
  StopLoss: IDL.Null, TakeProfit: IDL.Null, DCA: IDL.Null,
  Rebalance: IDL.Null, LiquidityProvision: IDL.Null,
  VolatilityTrigger: IDL.Null, Scheduled: IDL.Null,
  APYMigration: IDL.Null,
});

const RuleStatus = IDL.Variant({
  Active: IDL.Null, Cancelled: IDL.Null, Confirmed: IDL.Null,
  Draft: IDL.Null, Executed: IDL.Null, Executing: IDL.Null,
  Failed: IDL.Null, Paused: IDL.Null, Ready: IDL.Null,
});

const DCAConfig = IDL.Record({
  intervalSeconds: IDL.Nat64,
  maxExecutions: IDL.Opt(IDL.Nat),
});

const Rule = IDL.Record({
  apyMigrationConfig: IDL.Opt(IDL.Reserved),
  chainType: ChainType,
  createdAt: IDL.Int,
  dcaConfig: IDL.Opt(DCAConfig),
  id: IDL.Nat,
  lpConfig: IDL.Opt(IDL.Reserved),
  positionId: IDL.Nat,
  ruleType: RuleType,
  scheduledConfig: IDL.Opt(IDL.Reserved),
  sizePct: IDL.Nat,
  status: RuleStatus,
  swapAmountDrops: IDL.Opt(IDL.Nat64),
  swapAmountLamports: IDL.Opt(IDL.Nat64),
  swapAmountWei: IDL.Opt(IDL.Nat),
  triggerPrice: IDL.Nat64,
  volatilityConfig: IDL.Opt(IDL.Reserved),
});

// ── IDL Factory ──────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: _IDL }) => {
  return IDL.Service({
    // ── Read: Address methods (take principal, return address info) ──
    getEvmAddressFor: IDL.Func([IDL.Principal], [EvmAddressInfo], []),
    getSolanaAddressFor: IDL.Func([IDL.Principal], [SolanaAddressInfo], []),
    getBitcoinAddressFor: IDL.Func([IDL.Principal], [AddressInfo], []),
    getLitecoinAddressFor: IDL.Func([IDL.Principal], [AddressInfo], []),
    getTonAddressFor: IDL.Func([IDL.Principal], [TonAddressInfo], []),
    getXrpAddressFor: IDL.Func([IDL.Principal], [XrpAddressInfo], []),
    getSuiAddressFor: IDL.Func([IDL.Principal], [SuiAddressInfo], []),
    getCloakAddressFor: IDL.Func([IDL.Principal], [CloakAddressInfo], []),

    // ── Read: Balance methods ──
    getICPBalanceFor: IDL.Func([IDL.Principal], [ResultNat64], []),
    getSolanaBalance: IDL.Func([IDL.Text], [ResultNat64], []),
    getEvmBalance: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(IDL.Nat)], []),
    getBitcoinBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getLitecoinBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getSuiBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getTonBalanceFor: IDL.Func([IDL.Text], [ResultNat64], []),
    getCloakBalanceFor: IDL.Func([IDL.Text], [ResultNat64], []),
    getThorBalanceFor: IDL.Func([IDL.Text], [IDL.Vec(Balance)], []),

    // ── Write: Send methods (caller-signed) ──
    sendEvmNativeTokenAutonomous: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text, IDL.Nat, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    sendBitcoin: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendSolTransaction: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendICP: IDL.Func([IDL.Principal, IDL.Nat64], [SendResultGeneric], []),
    sendSui: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendTonSimple: IDL.Func([IDL.Text, IDL.Nat64], [SendResultGeneric], []),
    sendXrpAutonomous: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Opt(IDL.Nat32)],
      [SendResultGeneric], [],
    ),
    sendICRC1: IDL.Func(
      [IDL.Principal, IDL.Nat, IDL.Text],
      [SendResultGeneric], [],
    ),

    // ── Write: Swap methods ──
    swapTokens: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Bool, IDL.Text],
      [SwapResult], [],
    ),

    // ── Write: Strategy methods ──
    addStrategyRule: IDL.Func([Rule], [ResultNat], []),
    deleteStrategyRule: IDL.Func([IDL.Nat], [ResultVoid], []),
    getMyStrategyRules: IDL.Func([], [IDL.Vec(Rule)], []),
    updateStrategyRuleStatus: IDL.Func([IDL.Nat, RuleStatus], [ResultVoid], []),

    // ── Write: Staking/Lending ──
    stakeEthForStEth: IDL.Func(
      [IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveSupplyEth: IDL.Func(
      [IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveSupplyToken: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveWithdrawEth: IDL.Func(
      [IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
    aaveWithdrawToken: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text, IDL.Opt(IDL.Text)],
      [SendResultGeneric], [],
    ),
  });
};

// ── EVM RPC Endpoints ────────────────────────────────────────────────

const EVM_RPC: Record<EvmChain, string> = {
  ethereum: "https://eth.llamarpc.com",
  polygon: "https://polygon-rpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
  bnb: "https://bscrpc.com",
};

// ── Actor Cache ──────────────────────────────────────────────────────

let cachedActor: ReturnType<typeof Actor.createActor> | null = null;
let cachedCanisterId: string | null = null;

function getActor(config: MeneseConfig) {
  if (cachedActor && cachedCanisterId === config.sdkCanisterId) {
    return cachedActor;
  }

  const agent = HttpAgent.createSync({ host: "https://icp-api.io" });
  cachedActor = Actor.createActor(idlFactory, {
    agent,
    canisterId: config.sdkCanisterId,
  });
  cachedCanisterId = config.sdkCanisterId;
  return cachedActor;
}

// ── Address Cache ────────────────────────────────────────────────────
// Addresses are deterministic per principal — cache permanently.

const addressCache = new Map<string, ChainAddresses>();

export interface ChainAddresses {
  evm?: { evmAddress: string; publicKeyHex: string };
  solana?: { address: string };
  bitcoin?: { bech32Address: string };
  litecoin?: { bech32Address: string };
  ton?: { bounceable: string; nonBounceable: string };
  xrp?: { classicAddress: string };
  sui?: { suiAddress: string };
  cloakcoin?: { base58Address: string };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get all derived addresses for a principal (cached after first call).
 */
export async function getAllAddresses(
  config: MeneseConfig,
  principalText: string,
): Promise<{ ok: true; data: ChainAddresses } | { ok: false; error: string }> {
  const cached = addressCache.get(principalText);
  if (cached) return { ok: true, data: cached };

  try {
    const actor = getActor(config) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const p = Principal.fromText(principalText);

    // Fetch all addresses in parallel
    const [evm, sol, btc, ltc, ton, xrp, sui, cloak] = await Promise.all([
      actor.getEvmAddressFor(p) as Promise<{ evmAddress: string; publicKeyHex: string }>,
      actor.getSolanaAddressFor(p) as Promise<{ address: string }>,
      actor.getBitcoinAddressFor(p) as Promise<{ bech32Address: string }>,
      actor.getLitecoinAddressFor(p) as Promise<{ bech32Address: string }>,
      actor.getTonAddressFor(p) as Promise<{ bounceable: string; nonBounceable: string }>,
      actor.getXrpAddressFor(p) as Promise<{ classicAddress: string }>,
      actor.getSuiAddressFor(p) as Promise<{ suiAddress: string }>,
      actor.getCloakAddressFor(p) as Promise<{ base58Address: string }>,
    ]);

    const result: ChainAddresses = {
      evm: { evmAddress: evm.evmAddress, publicKeyHex: evm.publicKeyHex },
      solana: { address: sol.address },
      bitcoin: { bech32Address: btc.bech32Address },
      litecoin: { bech32Address: ltc.bech32Address },
      ton: { bounceable: ton.bounceable, nonBounceable: ton.nonBounceable },
      xrp: { classicAddress: xrp.classicAddress },
      sui: { suiAddress: sui.suiAddress },
      cloakcoin: { base58Address: cloak.base58Address },
    };

    addressCache.set(principalText, result);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: `Failed to fetch addresses: ${err}` };
  }
}

/**
 * Get the derived address for a specific chain.
 */
export async function getChainAddress(
  config: MeneseConfig,
  principalText: string,
  chain: string,
): Promise<string | null> {
  const res = await getAllAddresses(config, principalText);
  if (!res.ok) return null;
  const a = res.data;
  const evmChains = EVM_CHAINS as readonly string[];

  if (evmChains.includes(chain)) return a.evm?.evmAddress ?? null;
  if (chain === "solana") return a.solana?.address ?? null;
  if (chain === "bitcoin") return a.bitcoin?.bech32Address ?? null;
  if (chain === "litecoin") return a.litecoin?.bech32Address ?? null;
  if (chain === "ton") return a.ton?.bounceable ?? null;
  if (chain === "xrp") return a.xrp?.classicAddress ?? null;
  if (chain === "sui") return a.sui?.suiAddress ?? null;
  if (chain === "cloakcoin") return a.cloakcoin?.base58Address ?? null;
  if (chain === "icp") return principalText; // ICP uses principal directly
  return null;
}

/**
 * Result type for balance queries.
 */
export interface BalanceResult {
  chain: string;
  address: string;
  balance: string;
  decimals: number;
  symbol: string;
}

/**
 * Get balance for a specific chain.
 */
export async function getChainBalance(
  config: MeneseConfig,
  principalText: string,
  chain: string,
): Promise<{ ok: true; data: BalanceResult } | { ok: false; error: string }> {
  try {
    const actor = getActor(config) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const evmChains = EVM_CHAINS as readonly string[];

    // ICP uses principal directly
    if (chain === "icp") {
      const p = Principal.fromText(principalText);
      const res = (await actor.getICPBalanceFor(p)) as { ok?: bigint; err?: string };
      if ("err" in res && res.err) return { ok: false, error: res.err };
      const raw = res.ok ?? 0n;
      return {
        ok: true,
        data: {
          chain: "icp",
          address: principalText,
          balance: formatBalance(raw, 8),
          decimals: 8,
          symbol: "ICP",
        },
      };
    }

    // Get the address first
    const address = await getChainAddress(config, principalText, chain);
    if (!address) {
      return { ok: false, error: `Cannot derive address for chain: ${chain}` };
    }

    // EVM chains
    if (evmChains.includes(chain)) {
      const rpc = EVM_RPC[chain as EvmChain];
      const res = (await actor.getEvmBalance(address, rpc)) as [bigint] | [];
      const raw = res[0] ?? 0n;
      const symbol = chain === "bnb" ? "BNB" : chain === "polygon" ? "MATIC" : "ETH";
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 18), decimals: 18, symbol },
      };
    }

    // Solana
    if (chain === "solana") {
      const res = (await actor.getSolanaBalance(address)) as { ok?: bigint; err?: string };
      if ("err" in res && res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(res.ok ?? 0n, 9), decimals: 9, symbol: "SOL" },
      };
    }

    // Bitcoin
    if (chain === "bitcoin") {
      const raw = (await actor.getBitcoinBalanceFor(address)) as bigint;
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 8), decimals: 8, symbol: "BTC" },
      };
    }

    // Litecoin
    if (chain === "litecoin") {
      const raw = (await actor.getLitecoinBalanceFor(address)) as bigint;
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 8), decimals: 8, symbol: "LTC" },
      };
    }

    // Sui
    if (chain === "sui") {
      const raw = (await actor.getSuiBalanceFor(address)) as bigint;
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(raw, 9), decimals: 9, symbol: "SUI" },
      };
    }

    // TON
    if (chain === "ton") {
      const res = (await actor.getTonBalanceFor(address)) as { ok?: bigint; err?: string };
      if ("err" in res && res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(res.ok ?? 0n, 9), decimals: 9, symbol: "TON" },
      };
    }

    // Cloakcoin
    if (chain === "cloakcoin") {
      const res = (await actor.getCloakBalanceFor(address)) as { ok?: bigint; err?: string };
      if ("err" in res && res.err) return { ok: false, error: res.err };
      return {
        ok: true,
        data: { chain, address, balance: formatBalance(res.ok ?? 0n, 8), decimals: 8, symbol: "CLOAK" },
      };
    }

    // Thorchain
    if (chain === "thorchain") {
      // Thorchain uses the Bitcoin address
      const btcAddr = await getChainAddress(config, principalText, "bitcoin");
      if (!btcAddr) return { ok: false, error: "Cannot derive Thorchain address" };
      const balances = (await actor.getThorBalanceFor(btcAddr)) as Array<{ amount: bigint; denom: string }>;
      const rune = balances.find((b) => b.denom === "rune");
      return {
        ok: true,
        data: {
          chain,
          address: btcAddr,
          balance: formatBalance(rune?.amount ?? 0n, 8),
          decimals: 8,
          symbol: "RUNE",
        },
      };
    }

    return { ok: false, error: `Balance query not supported for chain: ${chain}` };
  } catch (err) {
    return { ok: false, error: `Balance query failed: ${err}` };
  }
}

/**
 * Get portfolio — balances across all supported chains.
 */
export async function getPortfolio(
  config: MeneseConfig,
  principalText: string,
): Promise<{ ok: true; data: BalanceResult[] } | { ok: false; error: string }> {
  // Query the most common chains in parallel
  const chains = ["icp", "ethereum", "solana", "bitcoin", "polygon", "arbitrum", "base", "sui", "ton"];

  const results = await Promise.allSettled(
    chains.map((chain) => getChainBalance(config, principalText, chain)),
  );

  const balances: BalanceResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.ok) {
      balances.push(r.value.data);
    }
  }

  return { ok: true, data: balances };
}

// ── Identity Management ──────────────────────────────────────────────

/** Generate a new 32-byte random seed (returned as 64-char hex). */
export function generateSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Derive an ICP principal text from a 32-byte hex seed. */
export function getPrincipalFromSeed(seed: string): string {
  const identity = Ed25519KeyIdentity.fromSecretKey(hexToBytes(seed));
  return identity.getPrincipal().toText();
}

/** Create an authenticated Actor for the SDK canister using a user's seed. */
function getAuthenticatedActor(config: MeneseConfig, seed: string) {
  const identity = Ed25519KeyIdentity.fromSecretKey(hexToBytes(seed));
  const agent = HttpAgent.createSync({ host: "https://icp-api.io", identity });
  return Actor.createActor(idlFactory, {
    agent,
    canisterId: config.sdkCanisterId,
  }) as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

// ── Generic result type for write operations ─────────────────────────

export type SdkWriteResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parseResult<T>(raw: unknown): SdkWriteResult<T> {
  const r = raw as { ok?: T; err?: string };
  if (r.err !== undefined) return { ok: false, error: r.err };
  return { ok: true, data: r.ok as T };
}

// ── EVM Chain IDs ────────────────────────────────────────────────────

const EVM_CHAIN_ID: Record<EvmChain, bigint> = {
  ethereum: 1n,
  polygon: 137n,
  arbitrum: 42161n,
  base: 8453n,
  optimism: 10n,
  bnb: 56n,
};

// ── Write: Send ──────────────────────────────────────────────────────

export async function sendToken(
  config: MeneseConfig,
  seed: string,
  chain: string,
  to: string,
  amount: string,
  opts?: { token?: string; memo?: string },
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const evmChains = EVM_CHAINS as readonly string[];

    if (evmChains.includes(chain)) {
      const weiAmount = parseUnits(amount, 18);
      const chainId = EVM_CHAIN_ID[chain as EvmChain];
      const rpc = EVM_RPC[chain as EvmChain];
      const res = await actor.sendEvmNativeTokenAutonomous(to, weiAmount, rpc, chainId, []);
      return parseResult(res);
    }
    if (chain === "bitcoin") {
      const sats = parseUnits(amount, 8);
      const res = await actor.sendBitcoin(to, sats);
      return parseResult(res);
    }
    if (chain === "solana") {
      const lamports = parseUnits(amount, 9);
      const res = await actor.sendSolTransaction(to, lamports);
      return parseResult(res);
    }
    if (chain === "icp") {
      const e8s = parseUnits(amount, 8);
      const res = await actor.sendICP(Principal.fromText(to), e8s);
      return parseResult(res);
    }
    if (chain === "sui") {
      const mist = parseUnits(amount, 9);
      const res = await actor.sendSui(to, mist);
      return parseResult(res);
    }
    if (chain === "ton") {
      const nanoton = parseUnits(amount, 9);
      const res = await actor.sendTonSimple(to, nanoton);
      return parseResult(res);
    }
    if (chain === "xrp") {
      const res = await actor.sendXrpAutonomous(to, amount, []);
      return parseResult(res);
    }
    return { ok: false, error: `Send not supported for chain: ${chain}` };
  } catch (err) {
    return { ok: false, error: `Send failed: ${err}` };
  }
}

// ── Write: Swap ──────────────────────────────────────────────────────

export async function swapTokensOnChain(
  config: MeneseConfig,
  seed: string,
  params: {
    chain: string;
    fromToken: string;
    toToken: string;
    amount: string;
    slippageBps?: number;
  },
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const evmChains = EVM_CHAINS as readonly string[];

    if (evmChains.includes(params.chain)) {
      const amountWei = parseUnits(params.amount, 18);
      const rpc = EVM_RPC[params.chain as EvmChain];
      const slippage = BigInt(params.slippageBps ?? 250);
      // quoteId is empty — SDK will auto-quote
      const res = await actor.swapTokens(
        "", params.fromToken, params.toToken,
        amountWei, slippage, false, rpc,
      );
      return parseResult(res);
    }

    return { ok: false, error: `Swap not yet supported for chain: ${params.chain}. Currently EVM chains only.` };
  } catch (err) {
    return { ok: false, error: `Swap failed: ${err}` };
  }
}

// ── Write: Staking/Lending ───────────────────────────────────────────

export async function stakeOrLend(
  config: MeneseConfig,
  seed: string,
  params: {
    action: string;  // "supply" | "withdraw" | "stake"
    protocol: string; // "aave" | "lido"
    chain: string;
    asset?: string;
    amount: string;
  },
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const evmChains = EVM_CHAINS as readonly string[];
    if (!evmChains.includes(params.chain)) {
      return { ok: false, error: `Staking/lending not supported for chain: ${params.chain}` };
    }
    const rpc = EVM_RPC[params.chain as EvmChain];
    const amountWei = parseUnits(params.amount, 18);

    if (params.protocol === "lido" && params.action === "stake") {
      const res = await actor.stakeEthForStEth(amountWei, rpc, []);
      return parseResult(res);
    }
    if (params.protocol === "aave") {
      if (params.action === "supply" && (!params.asset || params.asset.toUpperCase() === "ETH")) {
        const res = await actor.aaveSupplyEth(amountWei, rpc, []);
        return parseResult(res);
      }
      if (params.action === "supply" && params.asset) {
        const res = await actor.aaveSupplyToken(params.asset, amountWei, rpc, []);
        return parseResult(res);
      }
      if (params.action === "withdraw" && (!params.asset || params.asset.toUpperCase() === "ETH")) {
        const res = await actor.aaveWithdrawEth(amountWei, rpc, []);
        return parseResult(res);
      }
      if (params.action === "withdraw" && params.asset) {
        const res = await actor.aaveWithdrawToken(params.asset, amountWei, rpc, []);
        return parseResult(res);
      }
    }
    return { ok: false, error: `Unsupported staking/lending: ${params.protocol} ${params.action}` };
  } catch (err) {
    return { ok: false, error: `Staking/lending failed: ${err}` };
  }
}

// ── Write: Strategy ──────────────────────────────────────────────────

export async function addStrategy(
  config: MeneseConfig,
  seed: string,
  rule: Record<string, unknown>,
): Promise<SdkWriteResult<bigint>> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = await actor.addStrategyRule(rule);
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Add strategy failed: ${err}` };
  }
}

export async function listStrategies(
  config: MeneseConfig,
  seed: string,
): Promise<SdkWriteResult<unknown[]>> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = await actor.getMyStrategyRules();
    return { ok: true, data: res as unknown[] };
  } catch (err) {
    return { ok: false, error: `List strategies failed: ${err}` };
  }
}

export async function deleteStrategy(
  config: MeneseConfig,
  seed: string,
  ruleId: number,
): Promise<SdkWriteResult> {
  try {
    const actor = getAuthenticatedActor(config, seed);
    const res = await actor.deleteStrategyRule(BigInt(ruleId));
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Delete strategy failed: ${err}` };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Parse a decimal string to smallest unit (e.g. "1.5" with 18 decimals → bigint). */
function parseUnits(value: string, decimals: number): bigint {
  const parts = value.split(".");
  const whole = parts[0] ?? "0";
  let frac = parts[1] ?? "";
  if (frac.length > decimals) frac = frac.slice(0, decimals);
  frac = frac.padEnd(decimals, "0");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac);
}

function formatBalance(raw: bigint | number, decimals: number): string {
  const n = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
