import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { isValidPrincipal } from "../store.js";

/**
 * /setup [principal?] — Onboarding flow for new users.
 *
 * If a principal is provided, validates and links.
 * Otherwise returns a guided message explaining how to get started.
 */
export function registerSetupCommand(
  api: OpenClawPluginApi,
  _config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "setup",
    description: "Connect your Menese wallet to start using crypto tools",
    acceptsArgs: true,
    handler: (ctx) => {
      const principal = ctx.args?.trim();

      if (!principal) {
        const existing = store.resolve(ctx.channel, ctx.senderId ?? "unknown");
        if (existing) {
          return {
            text:
              `You already have a wallet linked: \`${existing}\`\n\n` +
              `To change it, run: /setup <new-principal>\n` +
              `To unlink, run: /link-wallet unlink`,
          };
        }

        return {
          text:
            "Welcome to Menese! Let's connect your wallet.\n\n" +
            "**What is this?**\n" +
            "Menese uses a non-custodial, canister-based wallet on the Internet Computer. " +
            "Your ICP principal acts as your identity across 19 blockchains.\n\n" +
            "**How to find your principal:**\n" +
            "1. Open your NNS wallet at https://nns.ic0.app\n" +
            "2. Copy your Principal ID from the account page\n" +
            "3. Run: `/setup <your-principal>`\n\n" +
            "**Example:**\n" +
            "`/setup xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxx`\n\n" +
            "Once linked, you can check balances, swap tokens, bridge across chains, " +
            "stake, lend, and create automated strategies.",
        };
      }

      if (!isValidPrincipal(principal)) {
        return {
          text:
            `Invalid principal format: \`${principal}\`\n\n` +
            "A valid ICP principal uses groups of 5 base32 characters separated by dashes.\n" +
            "Example: `ewcc5-fiaaa-aaaab-afafq-cai`",
          isError: true,
        };
      }

      store.link(ctx.channel, ctx.senderId ?? "unknown", principal);

      return {
        text:
          `Wallet linked! Your principal: \`${principal}\`\n\n` +
          "You can now:\n" +
          "- Check balances: *\"Show me my portfolio\"*\n" +
          "- Swap tokens: *\"Swap 0.1 ETH to USDC on Ethereum\"*\n" +
          "- Bridge assets: *\"Bridge 100 USDC from Ethereum to Solana\"*\n" +
          "- View history: `/history`\n\n" +
          "Try: *\"Show me my portfolio\"*",
      };
    },
  });
}
