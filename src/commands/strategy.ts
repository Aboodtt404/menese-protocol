import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";

/**
 * /strategy — List active strategies.
 *
 * Not yet available — requires a MeneseAgent canister.
 */
export function registerStrategyCommand(
  api: OpenClawPluginApi,
  _config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "strategy",
    description: "List your active trading strategies",
    handler: (ctx) => {
      const principal = store.resolve(ctx.channel, ctx.senderId ?? "unknown");
      if (!principal) {
        return {
          text: "No wallet linked. Run `/setup` to connect your wallet first.",
          isError: true,
        };
      }

      return {
        text: "Strategy management is not yet available. " +
          "This feature requires a MeneseAgent canister instance.\n\n" +
          "Use `/portfolio` to check your current balances.",
      };
    },
  });
}
