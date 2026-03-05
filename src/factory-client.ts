/**
 * Candid client for the MeneseAgent Factory canister.
 *
 * Two agent modes:
 * - Anonymous: for public queries (getDepositInfo, checkDepositBalance, getMyAgents)
 * - Admin (signed): for gated updates (adminSpawnFor, cancelDeployment)
 *
 * The admin identity is derived from a hex-encoded Ed25519 seed configured
 * in MeneseConfig.factoryAdminSeed. Its principal must be added as a factory
 * admin via the factory's addAdmin() function.
 */

import { HttpAgent, Actor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Principal } from "@dfinity/principal";
import { Ed25519KeyIdentity } from "@dfinity/identity";

// ── Candid Types ─────────────────────────────────────────────────────

const ICRCAccount = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
});

const AgentTier = IDL.Variant({
  Starter: IDL.Null,
  Professional: IDL.Null,
  Enterprise: IDL.Null,
});

const ReleaseChannel = IDL.Variant({
  Stable: IDL.Null,
  Beta: IDL.Null,
});

const AgentStatus = IDL.Variant({
  Running: IDL.Null,
  Paused: IDL.Null,
  Destroyed: IDL.Null,
});

const DepositInfo = IDL.Record({
  account: ICRCAccount,
  amountE8s: IDL.Nat,
  accountIdHex: IDL.Text,
});

const DepositStatus = IDL.Record({
  balance: IDL.Nat,
  required: IDL.Nat,
  funded: IDL.Bool,
});

const SpawnWithKeyResult = IDL.Record({
  canisterId: IDL.Principal,
  wasmVersion: IDL.Nat,
  cyclesAllocated: IDL.Nat,
  apiKey: IDL.Text,
});

const AgentRecord = IDL.Record({
  canisterId: IDL.Principal,
  owner: IDL.Principal,
  name: IDL.Text,
  description: IDL.Text,
  tier: AgentTier,
  status: AgentStatus,
  wasmVersion: IDL.Nat,
  createdAt: IDL.Int,
  cyclesAtCreation: IDL.Nat,
});

// ── IDL Factory ──────────────────────────────────────────────────────

const factoryIdl: IDL.InterfaceFactory = ({ IDL: _IDL }) => {
  return IDL.Service({
    // Queries
    getDepositInfo: IDL.Func(
      [IDL.Principal, AgentTier],
      [DepositInfo],
      ["query"],
    ),
    checkDepositBalance: IDL.Func(
      [IDL.Principal, AgentTier],
      [DepositStatus],
      ["query"],
    ),
    getMyAgents: IDL.Func(
      [IDL.Principal],
      [IDL.Vec(AgentRecord)],
      ["query"],
    ),

    // Admin updates
    adminSpawnFor: IDL.Func(
      [IDL.Principal, IDL.Text, IDL.Text, AgentTier, IDL.Opt(ReleaseChannel)],
      [IDL.Variant({ ok: SpawnWithKeyResult, err: IDL.Text })],
      [],
    ),
    cancelDeployment: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
      [],
    ),
  });
};

// ── TypeScript interfaces ────────────────────────────────────────────

export interface FactoryDepositInfo {
  account: { owner: Principal; subaccount: Uint8Array[] };
  amountE8s: bigint;
  accountIdHex: string;
}

export interface FactoryDepositStatus {
  balance: bigint;
  required: bigint;
  funded: boolean;
}

export interface FactorySpawnResult {
  canisterId: Principal;
  wasmVersion: bigint;
  cyclesAllocated: bigint;
  apiKey: string;
}

export interface FactoryAgentRecord {
  canisterId: Principal;
  owner: Principal;
  name: string;
  description: string;
  tier: { Starter: null } | { Professional: null } | { Enterprise: null };
  status: { Running: null } | { Paused: null } | { Destroyed: null };
  wasmVersion: bigint;
  createdAt: bigint;
  cyclesAtCreation: bigint;
}

export type FactoryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── Agent creation ───────────────────────────────────────────────────

function createAnonymousAgent() {
  return HttpAgent.createSync({ host: "https://icp-api.io" });
}

function createAdminAgent(adminSeed: string) {
  const seedBytes = hexToBytes(adminSeed);
  if (seedBytes.length !== 32) {
    throw new Error(
      `factoryAdminSeed must be 32 bytes (64 hex chars), got ${seedBytes.length} bytes`,
    );
  }
  const identity = Ed25519KeyIdentity.fromSecretKey(seedBytes);
  return HttpAgent.createSync({ host: "https://icp-api.io", identity });
}

function getQueryActor(factoryId: string) {
  const agent = createAnonymousAgent();
  return Actor.createActor(factoryIdl, { agent, canisterId: factoryId });
}

function getAdminActor(factoryId: string, adminSeed: string) {
  const agent = createAdminAgent(adminSeed);
  return Actor.createActor(factoryIdl, { agent, canisterId: factoryId });
}

// ── Tier helpers ─────────────────────────────────────────────────────

export const TIERS = {
  starter: {
    label: "Starter",
    icp: "0.5",
    e8s: 50_000_000,
    cycles: "0.5T",
    desc: "Testing & light usage",
    variant: { Starter: null },
  },
  professional: {
    label: "Professional",
    icp: "2",
    e8s: 200_000_000,
    cycles: "2T",
    desc: "Regular DeFi automation",
    variant: { Professional: null },
  },
  enterprise: {
    label: "Enterprise",
    icp: "5",
    e8s: 500_000_000,
    cycles: "5T",
    desc: "Heavy automation, multi-chain",
    variant: { Enterprise: null },
  },
} as const;

export type TierName = keyof typeof TIERS;

export function isValidTier(s: string): s is TierName {
  return s in TIERS;
}

function tierToVariant(tier: TierName) {
  return TIERS[tier].variant;
}

// ── Public API — Queries (anonymous) ─────────────────────────────────

export async function getDepositInfo(
  factoryId: string,
  principal: string,
  tier: TierName,
): Promise<FactoryResult<FactoryDepositInfo>> {
  try {
    const actor = getQueryActor(factoryId) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const result = await actor.getDepositInfo(
      Principal.fromText(principal),
      tierToVariant(tier),
    ) as FactoryDepositInfo;
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: `getDepositInfo failed: ${err}` };
  }
}

export async function checkDepositBalance(
  factoryId: string,
  principal: string,
  tier: TierName,
): Promise<FactoryResult<FactoryDepositStatus>> {
  try {
    const actor = getQueryActor(factoryId) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const result = await actor.checkDepositBalance(
      Principal.fromText(principal),
      tierToVariant(tier),
    ) as FactoryDepositStatus;
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: `checkDepositBalance failed: ${err}` };
  }
}

export async function getMyAgents(
  factoryId: string,
  principal: string,
): Promise<FactoryResult<FactoryAgentRecord[]>> {
  try {
    const actor = getQueryActor(factoryId) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const result = await actor.getMyAgents(
      Principal.fromText(principal),
    ) as FactoryAgentRecord[];
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: `getMyAgents failed: ${err}` };
  }
}

// ── Public API — Admin updates (signed) ──────────────────────────────

export async function adminSpawnFor(
  factoryId: string,
  adminSeed: string,
  owner: string,
  name: string,
  description: string,
  tier: TierName,
): Promise<FactoryResult<FactorySpawnResult>> {
  try {
    const actor = getAdminActor(factoryId, adminSeed) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const result = await actor.adminSpawnFor(
      Principal.fromText(owner),
      name,
      description,
      tierToVariant(tier),
      [], // useChannel: null → defaults to #Stable
    ) as { ok?: FactorySpawnResult; err?: string };

    if (result.err !== undefined) {
      return { ok: false, error: result.err };
    }
    return { ok: true, data: result.ok! };
  } catch (err) {
    return { ok: false, error: `adminSpawnFor failed: ${err}` };
  }
}

export async function cancelDeployment(
  factoryId: string,
  adminSeed: string,
  owner: string,
): Promise<FactoryResult<bigint>> {
  try {
    const actor = getAdminActor(factoryId, adminSeed) as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const result = await actor.cancelDeployment(
      Principal.fromText(owner),
    ) as { ok?: bigint; err?: string };

    if (result.err !== undefined) {
      return { ok: false, error: result.err };
    }
    return { ok: true, data: result.ok! };
  } catch (err) {
    return { ok: false, error: `cancelDeployment failed: ${err}` };
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
