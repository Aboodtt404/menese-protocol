import type { IdentityStore } from "../store.js";
import type { SdkWriteResult } from "../ic-client.js";
import type { AgentResult } from "../agent-client.js";
import { cacheInvalidate, cacheDel, CacheKeys } from "../cache.js";

/** JSON replacer that converts BigInt to string so JSON.stringify doesn't throw. */
function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Standard tool return: JSON text content block */
export function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, bigIntReplacer, 2) }],
    details: payload,
  };
}

/** Convert an SdkWriteResult to a tool result */
export function writeToResult<T>(res: SdkWriteResult<T>) {
  if (res.ok) {
    return jsonResult(res.data);
  }
  return jsonResult({ error: res.error });
}

/**
 * Require a linked wallet (read operations).
 * Returns the principal string on success, or a tool error result on failure.
 */
export function requireWallet(store: IdentityStore):
  | { principal: string }
  | { error: ReturnType<typeof jsonResult> } {
  const principal = store.resolve("tool", "current");
  if (!principal) {
    return {
      error: jsonResult({
        error: "No wallet set up. Run /setup to create your wallet.",
      }),
    };
  }
  return { principal };
}

/**
 * Require a linked wallet with identity seed (write operations).
 * Returns principal + seed on success, or a tool error result on failure.
 */
export function requireAuthenticatedWallet(store: IdentityStore):
  | { principal: string; seed: string }
  | { error: ReturnType<typeof jsonResult> } {
  const wallet = requireWallet(store);
  if ("error" in wallet) return wallet;

  const seed = store.getSeed("tool", "current");
  if (!seed) {
    return {
      error: jsonResult({
        error: "Identity not found. Run /setup to create your wallet.",
      }),
    };
  }

  return { principal: wallet.principal, seed };
}

/**
 * Require wallet + agent canister (agent operations).
 */
export function requireAgentWallet(store: IdentityStore):
  | { principal: string; seed: string; agentCanisterId: string }
  | { error: ReturnType<typeof jsonResult> } {
  const wallet = requireAuthenticatedWallet(store);
  if ("error" in wallet) return wallet;

  const agent = store.getAgent("tool", "current");
  if (!agent) {
    return {
      error: jsonResult({
        error: "No agent canister connected. Run /deploy-agent to set one up, or /deploy-agent link <canisterId> to connect an existing one.",
      }),
    };
  }
  return { ...wallet, agentCanisterId: agent.canisterId };
}

/** Check if the current tool user has an agent canister linked. */
export function hasAgent(store: IdentityStore): boolean {
  return store.getAgent("tool", "current") !== null;
}

/**
 * Bust all cached balance/portfolio data for a principal after a write op.
 * Call this after send/swap/stake/lend completes successfully.
 */
export function invalidateBalanceCaches(principal: string): void {
  cacheInvalidate(CacheKeys.userBalances(principal));
  cacheDel(CacheKeys.userPortfolio(principal));
}

/** Convert an AgentResult to a tool result */
export function agentToResult<T>(res: AgentResult<T>) {
  if (res.ok) {
    return jsonResult(res.data);
  }
  return jsonResult({ error: res.error });
}
