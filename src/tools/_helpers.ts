import type { IdentityStore } from "../store.js";
import type { SdkResponse } from "../sdk-client.js";

/** Standard tool return: JSON text content block */
export function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/** Convert an SdkResponse to a tool result — returns error with userMessage on failure */
export function sdkToResult<T>(res: SdkResponse<T>) {
  if (res.ok) {
    return jsonResult(res.data);
  }
  return jsonResult({ error: res.error.userMessage, code: res.error.code });
}

/**
 * Require a linked AND verified wallet for write operations.
 * Returns the principal string on success, or a tool error result on failure.
 */
export function requireVerifiedWallet(store: IdentityStore):
  | { principal: string }
  | { error: ReturnType<typeof jsonResult> } {
  const principal = store.resolve("tool", "current");
  if (!principal) {
    return {
      error: jsonResult({
        error: "No wallet linked. Use /setup to connect your wallet.",
      }),
    };
  }
  if (!store.isVerified("tool", "current")) {
    return {
      error: jsonResult({
        error: "Wallet not verified. Run /verify with your derived Ethereum address to prove ownership before making transactions.",
      }),
    };
  }
  return { principal };
}
