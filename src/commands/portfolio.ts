import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { querySdk } from "../sdk-client.js";

/**
 * /portfolio — Multi-chain balance summary.
 *
 * Fetches all balances from the SDK relay and formats them as a readable summary.
 */
export function registerPortfolioCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "portfolio",
    description: "Show your multi-chain balance summary",
    handler: async (ctx) => {
      const principal = store.resolve(ctx.channel, ctx.senderId ?? "unknown");
      if (!principal) {
        return {
          text: "No wallet linked. Run `/setup` to connect your wallet first.",
          isError: true,
        };
      }

      const res = await querySdk<Record<string, unknown>>("balances", config, { principal });

      if (!res.ok) {
        return {
          text: `Failed to fetch portfolio: ${res.error.userMessage}`,
          isError: true,
        };
      }

      const data = res.data;

      if (!data || typeof data !== "object") {
        return { text: "No balance data returned from the SDK." };
      }

      const lines: string[] = ["**Your Portfolio**\n"];
      let totalUsd = 0;

      const balances = (data.balances ?? data) as Record<string, unknown>;
      for (const [chain, info] of Object.entries(balances)) {
        if (info && typeof info === "object") {
          const bal = info as Record<string, unknown>;
          const amount = bal.balance ?? bal.amount ?? "0";
          const usd = typeof bal.usdValue === "number" ? bal.usdValue : 0;
          totalUsd += usd;
          const usdStr = usd > 0 ? ` ($${usd.toFixed(2)})` : "";
          lines.push(`- **${chain}**: ${amount}${usdStr}`);
        }
      }

      if (lines.length === 1) {
        lines.push("_No balances found. Your wallet may be empty or the chains are still syncing._");
      } else {
        lines.push(`\n**Total**: ~$${totalUsd.toFixed(2)} USD`);
      }

      return { text: lines.join("\n") };
    },
  });
}
