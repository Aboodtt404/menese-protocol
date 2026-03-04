import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";

const TIERS = ["basic", "developer", "pro", "enterprise"] as const;

const TIER_INFO: Record<string, { price: string; actions: string }> = {
  basic: { price: "$20/mo", actions: "100" },
  developer: { price: "$45.50/mo", actions: "1,000" },
  pro: { price: "$128.70/mo", actions: "5,000" },
  enterprise: { price: "$323.70/mo", actions: "Unlimited" },
};

/**
 * /subscribe [tier?] — View subscription plans.
 *
 * Subscription purchase is not yet available — requires Agent canister integration.
 */
export function registerSubscribeCommand(
  api: OpenClawPluginApi,
  _config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "subscribe",
    description: "View Menese SDK subscription plans",
    acceptsArgs: true,
    handler: (ctx) => {
      const principal = store.resolve(ctx.channel, ctx.senderId ?? "unknown");
      if (!principal) {
        return {
          text: "No wallet linked. Run `/setup` first to connect your ICP principal.",
          isError: true,
        };
      }

      const lines = TIERS.map((t) => {
        const info = TIER_INFO[t];
        return `- **${t}** — ${info.price} (${info.actions} actions/month)`;
      }).join("\n");

      return {
        text:
          "**Available plans:**\n" +
          lines +
          "\n\nSubscription purchase is not yet available through the plugin. " +
          "This feature requires a MeneseAgent canister instance.",
      };
    },
  });
}
