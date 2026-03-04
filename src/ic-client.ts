/**
 * Direct IC canister client — calls MeneseSDK canister methods via @dfinity/agent.
 *
 * This replaces the HTTP relay approach for READ operations (addresses, balances).
 * The SDK canister exposes public methods like getEvmAddressFor(principal) that
 * anyone can call without authentication.
 */

import { HttpAgent, Actor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
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
const Balance = IDL.Record({ amount: IDL.Nat, denom: IDL.Text });

// ── IDL Factory ──────────────────────────────────────────────────────

const idlFactory: IDL.InterfaceFactory = ({ IDL: _IDL }) => {
  return IDL.Service({
    // Address methods (take principal, return address info)
    getEvmAddressFor: IDL.Func([IDL.Principal], [EvmAddressInfo], []),
    getSolanaAddressFor: IDL.Func([IDL.Principal], [SolanaAddressInfo], []),
    getBitcoinAddressFor: IDL.Func([IDL.Principal], [AddressInfo], []),
    getLitecoinAddressFor: IDL.Func([IDL.Principal], [AddressInfo], []),
    getTonAddressFor: IDL.Func([IDL.Principal], [TonAddressInfo], []),
    getXrpAddressFor: IDL.Func([IDL.Principal], [XrpAddressInfo], []),
    getSuiAddressFor: IDL.Func([IDL.Principal], [SuiAddressInfo], []),
    getCloakAddressFor: IDL.Func([IDL.Principal], [CloakAddressInfo], []),

    // Balance methods (various signatures)
    getICPBalanceFor: IDL.Func([IDL.Principal], [ResultNat64], []),
    getSolanaBalance: IDL.Func([IDL.Text], [ResultNat64], []),
    getEvmBalance: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(IDL.Nat)], []),
    getBitcoinBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getLitecoinBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getSuiBalanceFor: IDL.Func([IDL.Text], [IDL.Nat64], []),
    getTonBalanceFor: IDL.Func([IDL.Text], [ResultNat64], []),
    getCloakBalanceFor: IDL.Func([IDL.Text], [ResultNat64], []),
    getThorBalanceFor: IDL.Func([IDL.Text], [IDL.Vec(Balance)], []),
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
    const actor = getActor(config) as Record<string, (...args: unknown[]) => Promise<unknown>>;
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
    const actor = getActor(config) as Record<string, (...args: unknown[]) => Promise<unknown>>;
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

// ── Helpers ──────────────────────────────────────────────────────────

function formatBalance(raw: bigint | number, decimals: number): string {
  const n = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = n / divisor;
  const frac = n % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
