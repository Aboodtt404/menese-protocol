import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { getPortfolio } from "../ic-client.js";

/**
 * /portfolio — Multi-chain balance summary.
 *
 * Fetches all balances from the SDK canister directly and formats them.
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

      const res = await getPortfolio(config, principal);

      if (!res.ok) {
        return {
          text: `Failed to fetch portfolio: ${res.error}`,
          isError: true,
        };
      }

      const balances = res.data;

      if (balances.length === 0) {
        return { text: "No balances found. Your wallet may be empty or the chains are still syncing." };
      }

      const lines: string[] = ["**Your Portfolio**\n"];
      for (const b of balances) {
        const amount = parseFloat(b.balance);
        if (amount > 0) {
          lines.push(`- **${b.chain}**: ${b.balance} ${b.symbol} (${b.address.slice(0, 8)}...)`);
        }
      }

      if (lines.length === 1) {
        lines.push("_All balances are zero._");
      }

      return { text: lines.join("\n") };
    },
  });
}
