import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { createBalanceTool } from "./balance.js";
import { createPricesTool } from "./prices.js";
import { createPortfolioTool } from "./portfolio.js";
import { createHistoryTool } from "./history.js";
import { createQuoteTool } from "./quote.js";
import { createSendTool } from "./send.js";
import { createSwapTool } from "./swap.js";
import { createBridgeTool } from "./bridge.js";
import { createStakeTool } from "./stake.js";
import { createLendTool } from "./lend.js";
import { createLiquidityTool } from "./liquidity.js";
import { createStrategyTool } from "./strategy.js";
import { createJobsTool } from "./jobs.js";

/**
 * Extract the sender ID from an OpenClaw sessionKey.
 *
 * Session keys follow varying patterns:
 *   agent:<agentId>:<channel>:<senderId>
 *   agent:<agentId>:<channel>:<chatType>:<senderId>
 *   agent:<agentId>:<channel>:<senderId>:thread:<threadId>
 *   agent:<agentId>:<channel>:<chatType>:<senderId>:thread:<threadId>
 *
 * Examples:
 *   "agent:main:telegram:direct:6093672913" → "6093672913"
 *   "agent:main:telegram:12345"             → "12345"
 *   "agent:main:telegram:12345:thread:42"   → "12345"
 *   "agent:main:discord:98765"              → "98765"
 *
 * Strategy: parts[3] may be a chat-type qualifier (e.g. "direct", "dm",
 * "group"). If it's non-numeric, the actual sender ID is at parts[4].
 */
function extractSenderFromSessionKey(sessionKey: string): string | null {
  const parts = sessionKey.split(":");
  if (parts.length < 4) return null;

  const candidate = parts[3]!;
  // If parts[3] looks like a numeric user ID, use it directly
  if (/^\d+$/.test(candidate)) return candidate;
  // Otherwise it's a chat-type qualifier — sender is at parts[4]
  return parts[4] ?? null;
}

export function registerMeneseTools(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  const toolFactories = [
    createBalanceTool,
    createPricesTool,
    createPortfolioTool,
    createHistoryTool,
    createQuoteTool,
    createSendTool,
    createSwapTool,
    createBridgeTool,
    createStakeTool,
    createLendTool,
    createLiquidityTool,
    createStrategyTool,
    createJobsTool,
  ];

  // Use OpenClaw's tool factory pattern so each tool invocation gets
  // the correct user identity from the session context.
  //
  // Commands store identity as  channel:senderId  (e.g. "telegram:12345")
  // Tool factories receive ctx.sessionKey like "agent:main:telegram:12345"
  // We extract the senderId from the sessionKey to look up the right principal.
  api.registerTool(
    (ctx) => {
      const channel = ctx.messageChannel ?? "unknown";
      const senderId = ctx.sessionKey
        ? extractSenderFromSessionKey(ctx.sessionKey)
        : null;

      // Resolve the principal for this session's user and set it as
      // the "current" tool identity so execute() methods can find it.
      const principal = senderId ? store.resolve(channel, senderId) : null;
      if (principal) {
        store.link("tool", "current", principal);

        // Copy verification status
        const entry = store.getEntry(channel, senderId!);
        if (entry?.verified) {
          store.markVerified("tool", "current");
        }

        // Copy identity seed so requireAuthenticatedWallet works
        if (entry?.identitySeed) {
          store.setSeed("tool", "current", entry.identitySeed);
        }

        // Copy agent canister ID so requireAgentWallet works
        if (entry?.agentCanisterId) {
          store.setAgent("tool", "current", entry.agentCanisterId);
        } else {
          store.clearAgent("tool", "current");
        }
      } else {
        // Clear stale tool:current so tools don't use a previous user's principal
        store.unlink("tool", "current");
      }

      return toolFactories.map((create) => create(config, store));
    },
  );
}
