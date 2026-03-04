import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { isValidPrincipal } from "../store.js";
import { getAllAddresses } from "../ic-client.js";

/**
 * /setup [principal?] — Onboarding flow for new users.
 *
 * If a principal is provided, validates it, links it,
 * fetches derived addresses from the SDK canister to confirm validity,
 * and auto-verifies the wallet.
 */
export function registerSetupCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "setup",
    description: "Connect your Menese wallet to start using crypto tools",
    acceptsArgs: true,
    handler: async (ctx) => {
      const principal = ctx.args?.trim();
      const senderId = ctx.senderId ?? "unknown";

      if (!principal) {
        const entry = store.getEntry(ctx.channel, senderId);
        if (entry) {
          const status = entry.verified ? "verified" : "**unverified** — run `/verify` to complete setup";
          return {
            text:
              `You already have a wallet linked: \`${entry.principal}\`\n` +
              `Status: ${status}\n\n` +
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
            "Once linked and verified, you can check balances, swap tokens, bridge across chains, " +
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

      // Link the principal and auto-verify
      store.link(ctx.channel, senderId, principal);

      // Fetch addresses from SDK canister to confirm the principal is valid
      const addrRes = await getAllAddresses(config, principal);

      if (!addrRes.ok) {
        return {
          text:
            `Wallet linked but could not fetch addresses.\n` +
            `Principal: \`${principal}\`\n` +
            `Reason: ${addrRes.error}\n\n` +
            `Run \`/setup ${principal}\` again later to retry.`,
        };
      }

      // Auto-verify — the principal is valid and we fetched addresses
      store.markVerified(ctx.channel, senderId);

      const evm = addrRes.data.evm?.evmAddress ?? "—";
      const sol = addrRes.data.solana?.address ?? "—";
      const btc = addrRes.data.bitcoin ?? "—";

      return {
        text:
          `Wallet connected and verified!\n\n` +
          `**Principal:** \`${principal}\`\n` +
          `**ETH:** \`${evm}\`\n` +
          `**SOL:** \`${sol}\`\n` +
          `**BTC:** \`${btc}\`\n\n` +
          "You're all set. Try:\n" +
          "- *\"Show me my portfolio\"*\n" +
          "- *\"What's the price of ETH?\"*\n" +
          "- *\"Check my SOL balance\"*",
      };
    },
  });
}
