import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { callSdk, querySdk } from "../sdk-client.js";

const TIERS = ["basic", "developer", "pro", "enterprise"] as const;

const TIER_INFO: Record<string, { price: string; actions: string }> = {
  basic: { price: "$20/mo", actions: "100" },
  developer: { price: "$45.50/mo", actions: "1,000" },
  pro: { price: "$128.70/mo", actions: "5,000" },
  enterprise: { price: "$323.70/mo", actions: "Unlimited" },
};

/**
 * /subscribe [tier?] — View subscription plans or purchase one.
 *
 * No args: shows available tiers and current subscription status.
 * With tier: initiates purchase of that tier.
 */
export function registerSubscribeCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "subscribe",
    description: "View or purchase a Menese SDK subscription plan",
    acceptsArgs: true,
    handler: async (ctx) => {
      const principal = store.resolve(ctx.channel, ctx.senderId ?? "unknown");
      if (!principal) {
        return {
          text: "No wallet linked. Run `/setup` first to connect your ICP principal.",
          isError: true,
        };
      }

      const tier = ctx.args?.trim().toLowerCase();

      // No args: show plans + current status
      if (!tier) {
        let statusLine = "";
        const statusRes = await querySdk("subscription", config, { principal });
        if (statusRes.ok) {
          const data = statusRes.data as Record<string, unknown>;
          const currentTier = data.tier ?? data.plan ?? "none";
          const remaining = data.actionsRemaining ?? data.remaining ?? "?";
          statusLine =
            `**Current plan:** ${currentTier}\n` +
            `**Actions remaining:** ${remaining}\n\n`;
        }

        const lines = TIERS.map((t) => {
          const info = TIER_INFO[t];
          return `- **${t}** — ${info.price} (${info.actions} actions/month)`;
        }).join("\n");

        return {
          text:
            statusLine +
            "**Available plans:**\n" +
            lines +
            "\n\nTo subscribe: `/subscribe basic` (or developer, pro, enterprise)\n" +
            "Payment is in ICP from your linked wallet.",
        };
      }

      // Validate tier
      if (!TIERS.includes(tier as typeof TIERS[number])) {
        return {
          text:
            `Unknown tier: \`${tier}\`\n` +
            `Valid tiers: ${TIERS.join(", ")}`,
          isError: true,
        };
      }

      const info = TIER_INFO[tier];

      // Execute subscription purchase
      const res = await callSdk(
        "execute",
        {
          type: "subscribe",
          tier,
        },
        config,
        { principal },
      );

      if (!res.ok) {
        return {
          text:
            `Subscription failed: ${res.error.userMessage ?? res.error.message}\n\n` +
            `Plan: **${tier}** (${info.price})\n` +
            "Make sure your ICP wallet is funded to cover the subscription cost.",
          isError: true,
        };
      }

      return {
        text:
          `Subscribed to **${tier}** plan! (${info.price}, ${info.actions} actions/month)\n\n` +
          "You're ready to use all Menese crypto tools.",
      };
    },
  });
}
