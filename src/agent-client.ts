/**
 * MeneseAgent canister client — Candid-based actor calls via @dfinity/agent.
 *
 * Uses the user's Ed25519 seed to authenticate as the agent canister's owner/delegate.
 * IDL derived from MeneseAgent/.dfx/local/canisters/agent/agent.did
 */

import { HttpAgent, Actor } from "@dfinity/agent";
import { IDL } from "@dfinity/candid";
import { Ed25519KeyIdentity } from "@dfinity/identity";

// ── Helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// ── Candid Types ─────────────────────────────────────────────────────

const ChainId = IDL.Variant({
  Aptos: IDL.Null, Arbitrum: IDL.Null, BNB: IDL.Null, Base: IDL.Null,
  Bitcoin: IDL.Null, Cardano: IDL.Null, CloakCoin: IDL.Null,
  Ethereum: IDL.Null, ICP: IDL.Null, Litecoin: IDL.Null, NEAR: IDL.Null,
  Optimism: IDL.Null, Polygon: IDL.Null, Solana: IDL.Null, Sui: IDL.Null,
  TON: IDL.Null, Thorchain: IDL.Null, Tron: IDL.Null, XRP: IDL.Null,
});

const SendParams = IDL.Record({
  amount: IDL.Nat, chain: ChainId, memo: IDL.Opt(IDL.Text),
  to: IDL.Text, token: IDL.Opt(IDL.Text),
});

const SwapParams = IDL.Record({
  amount: IDL.Nat, chain: ChainId, dex: IDL.Opt(IDL.Text),
  fromToken: IDL.Text, slippageBps: IDL.Nat, toToken: IDL.Text,
});

const BridgeParams = IDL.Record({
  amount: IDL.Nat, fromChain: ChainId, protocol: IDL.Opt(IDL.Text),
  toChain: ChainId, token: IDL.Text,
});

const StakeParams = IDL.Record({
  action: IDL.Variant({ Stake: IDL.Null, Unstake: IDL.Null, Wrap: IDL.Null, Unwrap: IDL.Null }),
  amount: IDL.Nat, chain: ChainId, protocol: IDL.Text,
});

const LendParams = IDL.Record({
  action: IDL.Variant({ Borrow: IDL.Null, Repay: IDL.Null, Supply: IDL.Null, Withdraw: IDL.Null }),
  amount: IDL.Nat, asset: IDL.Text, chain: ChainId, protocol: IDL.Text,
});

const Operation = IDL.Variant({
  Bridge: BridgeParams,
  Custom: IDL.Record({ args: IDL.Text, functionName: IDL.Text }),
  GetAddress: IDL.Record({ chain: ChainId }),
  GetAllAddresses: IDL.Null,
  GetAllBalances: IDL.Null,
  GetBalance: IDL.Record({ chain: ChainId }),
  Lend: LendParams,
  Send: SendParams,
  Stake: StakeParams,
  Swap: SwapParams,
});

const OperationResult = IDL.Variant({ ok: IDL.Text, err: IDL.Text });

// Condition (recursive — use IDL.Rec)
const Condition = IDL.Rec();
Condition.fill(IDL.Variant({
  And: IDL.Vec(Condition),
  BalanceAbove: IDL.Record({ chain: ChainId, threshold: IDL.Nat }),
  BalanceBelow: IDL.Record({ chain: ChainId, threshold: IDL.Nat }),
  Or: IDL.Vec(Condition),
  PriceAbove: IDL.Record({ thresholdMicroUsd: IDL.Nat64, token: IDL.Text }),
  PriceBelow: IDL.Record({ thresholdMicroUsd: IDL.Nat64, token: IDL.Text }),
  TimeAfter: IDL.Int,
}));

const JobType = IDL.Variant({
  Conditional: IDL.Record({ checkIntervalSeconds: IDL.Nat, condition: Condition }),
  OneShot: IDL.Record({ executeAt: IDL.Int }),
  Recurring: IDL.Record({ intervalSeconds: IDL.Nat }),
});

// JobAction (recursive — Composite contains vec JobAction)
const JobAction = IDL.Rec();
JobAction.fill(IDL.Variant({
  Composite: IDL.Vec(JobAction),
  DataFetch: IDL.Record({ storeInMemory: IDL.Text, url: IDL.Text }),
  MemoryUpdate: IDL.Record({ newSummary: IDL.Text, nodeId: IDL.Text }),
  SdkCall: Operation,
}));

const JobStatus = IDL.Variant({
  Active: IDL.Null, Completed: IDL.Null,
  Failed: IDL.Text, Paused: IDL.Null,
});

const Job = IDL.Record({
  action: JobAction, allowFundMovement: IDL.Bool, createdAt: IDL.Int,
  createdBy: IDL.Principal, description: IDL.Text, executionCount: IDL.Nat,
  id: IDL.Nat, jobType: JobType, lastExecution: IDL.Opt(IDL.Int),
  lastResult: IDL.Opt(OperationResult), maxExecutions: IDL.Opt(IDL.Nat),
  name: IDL.Text, status: JobStatus,
});

const JobExecution = IDL.Record({
  durationNs: IDL.Int, jobId: IDL.Nat,
  result: OperationResult, timestamp: IDL.Int,
});

const AgentConfig = IDL.Record({
  description: IDL.Text, factoryCanisterId: IDL.Opt(IDL.Principal),
  name: IDL.Text, owner: IDL.Principal,
  sdkCanisterId: IDL.Principal, version: IDL.Nat,
});

const AccessTier = IDL.Variant({
  ApiKey: IDL.Null, Delegate: IDL.Null, Owner: IDL.Null, Public: IDL.Null,
});

const OperationLog = IDL.Record({
  caller: IDL.Principal, durationNs: IDL.Int, id: IDL.Nat,
  operation: IDL.Text, params: IDL.Text,
  result: OperationResult, retryCount: IDL.Nat, timestamp: IDL.Int,
});

// ── IDL Factory ──────────────────────────────────────────────────────

const agentIdlFactory: IDL.InterfaceFactory = ({ IDL: _IDL }) => {
  return IDL.Service({
    // Query methods
    health: IDL.Func([], [IDL.Text], ["query"]),
    getConfig: IDL.Func([], [AgentConfig], ["query"]),
    getCycleBalance: IDL.Func([], [IDL.Nat], ["query"]),
    listJobs: IDL.Func([], [IDL.Vec(Job)], ["query"]),
    getJob: IDL.Func([IDL.Nat], [IDL.Opt(Job)], ["query"]),
    getJobHistory: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(JobExecution)], ["query"]),
    getAccessTier: IDL.Func([IDL.Principal], [AccessTier], ["query"]),
    getDelegates: IDL.Func([], [IDL.Vec(IDL.Principal)], ["query"]),
    getOperationLogs: IDL.Func([IDL.Nat], [IDL.Vec(OperationLog)], ["query"]),
    getVersion: IDL.Func([], [IDL.Nat], ["query"]),

    // Update methods
    execute: IDL.Func([Operation], [OperationResult], []),
    createJob: IDL.Func(
      [IDL.Text, IDL.Text, JobType, JobAction, IDL.Bool, IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
      [],
    ),
    pauseJob: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: IDL.Text })], []),
    resumeJob: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: IDL.Text })], []),
    cancelJob: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: IDL.Text })], []),
  });
};

// ── Actor Factories ──────────────────────────────────────────────────

function getAgentActor(canisterId: string, seed: string) {
  const identity = Ed25519KeyIdentity.fromSecretKey(hexToBytes(seed));
  const agent = HttpAgent.createSync({ host: "https://icp-api.io", identity });
  return Actor.createActor(agentIdlFactory, { agent, canisterId }) as unknown as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
}

function getAnonymousAgentActor(canisterId: string) {
  const agent = HttpAgent.createSync({ host: "https://icp-api.io" });
  return Actor.createActor(agentIdlFactory, { agent, canisterId }) as unknown as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
}

// ── Result Type ──────────────────────────────────────────────────────

export type AgentResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function parseResult<T>(raw: unknown): AgentResult<T> {
  const r = raw as { ok?: T; err?: string };
  if (r.err !== undefined) return { ok: false, error: r.err };
  return { ok: true, data: r.ok as T };
}

// ── Chain String → ChainId Mapper ────────────────────────────────────

export const CHAIN_ID_MAP: Record<string, Record<string, null>> = {
  aptos: { Aptos: null }, arbitrum: { Arbitrum: null }, bnb: { BNB: null },
  base: { Base: null }, bitcoin: { Bitcoin: null }, cardano: { Cardano: null },
  cloakcoin: { CloakCoin: null }, ethereum: { Ethereum: null }, icp: { ICP: null },
  litecoin: { Litecoin: null }, near: { NEAR: null }, optimism: { Optimism: null },
  polygon: { Polygon: null }, solana: { Solana: null }, sui: { Sui: null },
  ton: { TON: null }, thorchain: { Thorchain: null }, tron: { Tron: null },
  xrp: { XRP: null },
};

export function toChainId(chain: string): Record<string, null> | null {
  return CHAIN_ID_MAP[chain.toLowerCase()] ?? null;
}

// ── Public API: Read ─────────────────────────────────────────────────

/** Health check — anonymous, no seed needed. */
export async function checkAgentHealth(
  canisterId: string,
): Promise<AgentResult<string>> {
  try {
    const actor = getAnonymousAgentActor(canisterId);
    const res = (await actor.health()) as string;
    return { ok: true, data: res };
  } catch (err) {
    return { ok: false, error: `Agent health check failed: ${err}` };
  }
}

/** Get agent config — needs authenticated caller. */
export async function getAgentConfig(
  canisterId: string,
  seed: string,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const actor = getAgentActor(canisterId, seed);
    const res = await actor.getConfig();
    return { ok: true, data: res as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: `Failed to get agent config: ${err}` };
  }
}

/** List all jobs — query call. */
export async function listAgentJobs(
  canisterId: string,
  seed: string,
): Promise<AgentResult<unknown[]>> {
  try {
    const actor = getAgentActor(canisterId, seed);
    const res = await actor.listJobs();
    return { ok: true, data: res as unknown[] };
  } catch (err) {
    return { ok: false, error: `Failed to list jobs: ${err}` };
  }
}

/** Get a single job by ID — query call. */
export async function getAgentJob(
  canisterId: string,
  seed: string,
  jobId: number,
): Promise<AgentResult<unknown | null>> {
  try {
    const actor = getAgentActor(canisterId, seed);
    const res = await actor.getJob(BigInt(jobId));
    const arr = res as unknown[];
    return { ok: true, data: arr.length > 0 ? arr[0] : null };
  } catch (err) {
    return { ok: false, error: `Failed to get job: ${err}` };
  }
}

// ── Public API: Write ────────────────────────────────────────────────

export interface CreateJobParams {
  name: string;
  description: string;
  jobType: unknown;    // Candid JobType variant
  action: unknown;     // Candid JobAction variant
  allowFundMovement: boolean;
  maxExecutions?: number;
}

/** Create a new job on the agent canister. */
export async function createAgentJob(
  canisterId: string,
  seed: string,
  params: CreateJobParams,
): Promise<AgentResult<bigint>> {
  try {
    const actor = getAgentActor(canisterId, seed);
    const res = await actor.createJob(
      params.name,
      params.description,
      params.jobType,
      params.action,
      params.allowFundMovement,
      params.maxExecutions != null ? [BigInt(params.maxExecutions)] : [],
    );
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Failed to create job: ${err}` };
  }
}

/** Pause a job. */
export async function pauseAgentJob(
  canisterId: string,
  seed: string,
  jobId: number,
): Promise<AgentResult> {
  try {
    const actor = getAgentActor(canisterId, seed);
    const res = await actor.pauseJob(BigInt(jobId));
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Failed to pause job: ${err}` };
  }
}

/** Resume a paused job. */
export async function resumeAgentJob(
  canisterId: string,
  seed: string,
  jobId: number,
): Promise<AgentResult> {
  try {
    const actor = getAgentActor(canisterId, seed);
    const res = await actor.resumeJob(BigInt(jobId));
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Failed to resume job: ${err}` };
  }
}

/** Cancel a job (cannot be resumed). */
export async function cancelAgentJob(
  canisterId: string,
  seed: string,
  jobId: number,
): Promise<AgentResult> {
  try {
    const actor = getAgentActor(canisterId, seed);
    const res = await actor.cancelJob(BigInt(jobId));
    return parseResult(res);
  } catch (err) {
    return { ok: false, error: `Failed to cancel job: ${err}` };
  }
}

// ── Job Builder Helpers ──────────────────────────────────────────────

/** Build a Recurring JobType variant. */
export function recurringJobType(intervalSeconds: number): unknown {
  return { Recurring: { intervalSeconds: BigInt(intervalSeconds) } };
}

/** Build a Conditional JobType variant with a price condition. */
export function conditionalJobType(
  checkIntervalSeconds: number,
  condition: unknown,
): unknown {
  return { Conditional: { checkIntervalSeconds: BigInt(checkIntervalSeconds), condition } };
}

/** Build a PriceAbove condition. */
export function priceAboveCondition(token: string, thresholdMicroUsd: number): unknown {
  return { PriceAbove: { token, thresholdMicroUsd: BigInt(thresholdMicroUsd) } };
}

/** Build a PriceBelow condition. */
export function priceBelowCondition(token: string, thresholdMicroUsd: number): unknown {
  return { PriceBelow: { token, thresholdMicroUsd: BigInt(thresholdMicroUsd) } };
}

/** Build an SdkCall(Swap) JobAction. */
export function swapJobAction(
  chain: string,
  fromToken: string,
  toToken: string,
  amount: bigint,
  slippageBps: number,
): unknown {
  const chainId = toChainId(chain);
  if (!chainId) throw new Error(`Unsupported chain: ${chain}`);
  return {
    SdkCall: {
      Swap: {
        chain: chainId,
        fromToken,
        toToken,
        amount,
        slippageBps: BigInt(slippageBps),
        dex: [],
      },
    },
  };
}
