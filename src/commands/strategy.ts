import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { querySdk } from "../sdk-client.js";

/**
 * /strategy — List active strategies.
 *
 * Queries the SDK for the user's active strategy rules and formats them.
 */
export function registerStrategyCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "strategy",
    description: "List your active trading strategies",
    handler: async (ctx) => {
      const principal = store.resolve(ctx.channel, ctx.senderId ?? "unknown");
      if (!principal) {
        return {
          text: "No wallet linked. Run `/setup` to connect your wallet first.",
          isError: true,
        };
      }

      const res = await querySdk<Record<string, unknown>>(
        "strategy/rules",
        config,
        { principal },
      );

      if (!res.ok) {
        return {
          text: `Failed to fetch strategies: ${res.error.userMessage}`,
          isError: true,
        };
      }

      const data = res.data;
      const rules = (Array.isArray(data.rules) ? data.rules : Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;

      if (rules.length === 0) {
        return {
          text:
            "No active strategies.\n\n" +
            "Create one by saying something like:\n" +
            "- *\"Set a stop-loss on ETH at $2,000\"*\n" +
            "- *\"DCA $50 into BTC weekly\"*\n" +
            "- *\"Take profit on SOL if it hits $200\"*",
        };
      }

      const lines: string[] = [`**Active Strategies** (${rules.length})\n`];

      for (const rule of rules) {
        const type = rule.ruleType ?? rule.type ?? "unknown";
        const status = rule.status ?? "active";
        const id = typeof rule.ruleId === "string" ? rule.ruleId.slice(0, 8) : "—";

        const parts: string[] = [`**${String(type).toUpperCase()}**`];
        if (rule.token) parts.push(String(rule.token));
        if (rule.chain) parts.push(`on ${rule.chain}`);
        if (rule.triggerPrice) parts.push(`@ $${rule.triggerPrice}`);
        if (rule.amount) parts.push(`${rule.amount}`);
        if (rule.frequency) parts.push(`(${rule.frequency})`);
        parts.push(`[${status}]`);
        parts.push(`id:${id}`);

        lines.push(`- ${parts.join(" ")}`);
      }

      return { text: lines.join("\n") };
    },
  });
}
