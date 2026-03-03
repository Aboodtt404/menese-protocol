import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import { getRateLimitStatus } from "../sdk-client.js";

/**
 * Transaction guard — three-layer protection for financial tools.
 *
 * 1. Rate limit check: warns when approaching SDK rate limits
 * 2. Quote enforcement: blocks execute calls that weren't preceded by a quote
 * 3. Threshold check: blocks amounts above autoApproveThreshold
 */

const GUARDED_TOOLS = new Set([
  "menese_send",
  "menese_swap",
  "menese_bridge",
  "menese_stake",
  "menese_lend",
  "menese_liquidity",
  "menese_strategy",
]);

// Track which operations have been quoted in the current process lifetime.
// Key format: `toolName:fromToken:toToken:chain` (or similar fingerprint)
const quotedOperations = new Set<string>();

function operationFingerprint(toolName: string, params: Record<string, unknown>): string {
  const parts = [toolName];
  if (params.chain) parts.push(String(params.chain));
  if (params.fromChain) parts.push(String(params.fromChain));
  if (params.toChain) parts.push(String(params.toChain));
  if (params.fromToken) parts.push(String(params.fromToken));
  if (params.toToken) parts.push(String(params.toToken));
  if (params.token) parts.push(String(params.token));
  if (params.asset) parts.push(String(params.asset));
  if (params.to) parts.push(String(params.to));
  return parts.join(":");
}

function formatOperationSummary(toolName: string, params: Record<string, unknown>): string {
  const name = toolName.replace("menese_", "").toUpperCase();
  const amount = params.amount ?? params.amountA ?? "";
  const token = params.token ?? params.asset ?? params.fromToken ?? "";
  const chain = params.chain ?? params.fromChain ?? "";

  const parts = [name];
  if (amount) parts.push(String(amount));
  if (token) parts.push(String(token));
  if (params.toToken) parts.push(`→ ${params.toToken}`);
  if (chain) parts.push(`on ${chain}`);
  if (params.toChain) parts.push(`→ ${params.toChain}`);
  if (params.to) parts.push(`to ${String(params.to).slice(0, 10)}...`);

  return parts.join(" ");
}

export function registerTransactionGuard(api: OpenClawPluginApi, config: MeneseConfig): void {
  api.on(
    "before_tool_call",
    async (event) => {
      if (!GUARDED_TOOLS.has(event.toolName)) return;

      const params = event.params as Record<string, unknown>;

      // Strategy: only guard "create" action
      if (event.toolName === "menese_strategy" && params.action !== "create") return;

      const mode = params.mode as string | undefined;
      const fingerprint = operationFingerprint(event.toolName, params);

      // ── Layer 1: Rate limit check ──
      const rateStatus = getRateLimitStatus();
      if (rateStatus.nearLimit) {
        return {
          block: true,
          blockReason:
            `Rate limit warning: ${rateStatus.requestsPerMinute}/60 requests this minute, ` +
            `${rateStatus.sdkCallsPerHour}/200 SDK calls this hour. ` +
            `Please wait a moment before making more transactions.`,
        };
      }

      // ── Layer 2: Quote enforcement ──
      if (mode === "quote") {
        // Record that this operation was quoted
        quotedOperations.add(fingerprint);
        return; // Allow quotes through
      }

      if (mode === "execute" && !quotedOperations.has(fingerprint)) {
        return {
          block: true,
          blockReason:
            `Please fetch a quote first so the user can review fees and expected output before executing. ` +
            `Call ${event.toolName} with mode "quote" first, present the result to the user, ` +
            `then call again with mode "execute" after they confirm.`,
        };
      }

      // Clear the quote after execute attempt (one-time use)
      if (mode === "execute") {
        quotedOperations.delete(fingerprint);
      }

      // ── Layer 3: Threshold check ──
      if (config.autoApproveThreshold > 0) {
        const amount = parseFloat(String(params.amount ?? params.amountA ?? "0"));
        if (!isNaN(amount) && amount > config.autoApproveThreshold) {
          const summary = formatOperationSummary(event.toolName, params);
          return {
            block: true,
            blockReason:
              `Transaction exceeds auto-approve threshold ($${config.autoApproveThreshold}). ` +
              `Operation: ${summary}. ` +
              `Please confirm with the user before proceeding.`,
          };
        }
      }
    },
    { priority: 100 },
  );
}
