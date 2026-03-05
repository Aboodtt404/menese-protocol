import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";

/**
 * /verify — Show wallet status. Wallets are auto-verified on /setup.
 */
export function registerVerifyCommand(
  api: OpenClawPluginApi,
  _config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "verify",
    description: "Check wallet status",
    acceptsArgs: false,
    handler: (ctx) => {
      const senderId = ctx.senderId ?? "unknown";
      const entry = store.getEntry(ctx.channel, senderId);

      if (!entry) {
        return {
          text: "No wallet set up. Run `/setup` to create one.",
          isError: true,
        };
      }

      const hasSeed = !!entry.identitySeed;
      const agentLine = entry.agentCanisterId
        ? `Agent: \`${entry.agentCanisterId}\` (on-chain automation enabled)`
        : "Agent: not connected (run `/deploy-agent link <id>` to enable)";
      return {
        text:
          `**Wallet Status**\n\n` +
          `Principal: \`${entry.principal}\`\n` +
          `Verified: ${entry.verified ? "yes" : "no"}\n` +
          `Identity: ${hasSeed ? "bot-managed" : "external (legacy)"}\n` +
          agentLine,
      };
    },
  });
}
