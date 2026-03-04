import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";

/**
 * /verify — Show wallet verification status.
 *
 * Wallets are now auto-verified during /setup.
 * This command exists for users who may have linked before auto-verify was added.
 */

export function registerVerifyCommand(
  api: OpenClawPluginApi,
  _config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "verify",
    description: "Check wallet verification status",
    acceptsArgs: false,
    handler: (ctx) => {
      const senderId = ctx.senderId ?? "unknown";
      const entry = store.getEntry(ctx.channel, senderId);

      if (!entry) {
        return {
          text: "No wallet linked. Run `/setup <principal>` first.",
          isError: true,
        };
      }

      if (entry.verified) {
        return {
          text: `Your wallet is verified.\nPrincipal: \`${entry.principal}\``,
        };
      }

      // Legacy unverified entry — tell them to re-run setup
      return {
        text:
          `Your wallet is linked but not yet verified.\n` +
          `Principal: \`${entry.principal}\`\n\n` +
          `Run \`/setup ${entry.principal}\` to verify.`,
      };
    },
  });
}
