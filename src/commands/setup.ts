import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { isValidPrincipal } from "../store.js";
import { querySdk } from "../sdk-client.js";

/**
 * /setup [principal?] — Onboarding flow for new users.
 *
 * If a principal is provided, validates it, links it as unverified,
 * fetches the derived Ethereum address from the SDK canister,
 * and prompts the user to run /verify with that address.
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

      // Link the principal (unverified)
      store.link(ctx.channel, senderId, principal);

      // Fetch all addresses — the EVM address is the ownership challenge
      const addrRes = await querySdk<{ evm?: { evmAddress?: string } }>(
        `addresses`,
        config,
        { principal },
      );

      if (!addrRes.ok) {
        // SDK call failed — still linked but can't set up challenge
        return {
          text:
            `Wallet linked (unverified): \`${principal}\`\n\n` +
            "Could not fetch your derived Ethereum address for verification at this time.\n" +
            `Reason: ${addrRes.error.userMessage}\n\n` +
            "You can still view balances and prices. " +
            `Run \`/setup ${principal}\` again later to retry verification, ` +
            "or contact support if this persists.",
        };
      }

      const ethAddress = (addrRes.data as { evm?: { evmAddress?: string } }).evm?.evmAddress;
      if (!ethAddress) {
        return {
          text:
            `Wallet linked (unverified): \`${principal}\`\n\n` +
            "Could not derive your Ethereum address — the SDK response was missing the EVM field.\n\n" +
            "You can still view balances and prices. " +
            `Run \`/setup ${principal}\` again later to retry verification.`,
        };
      }
      store.setChallenge(ctx.channel, senderId, ethAddress);

      return {
        text:
          `Wallet linked: \`${principal}\`\n\n` +
          "**One more step — verify ownership**\n\n" +
          "To prove you own this principal, provide the Ethereum address derived from it.\n" +
          "You can find this in your NNS wallet or Menese dashboard under \"Ethereum Address\".\n\n" +
          "Run: `/verify <your-ethereum-address>`\n\n" +
          "Until verified, you can check balances and prices but cannot make transactions.",
      };
    },
  });
}
