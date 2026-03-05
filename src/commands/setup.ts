import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { generateSeed, getPrincipalFromSeed, getAllAddresses } from "../ic-client.js";

/**
 * /setup — Create a bot-managed wallet for the user.
 *
 * Generates an Ed25519 keypair, derives the ICP principal, fetches
 * all chain addresses from the SDK canister, and stores everything.
 *
 * Also supports: /setup import <hex-seed> — import an existing seed.
 */
export function registerSetupCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "setup",
    description: "Create your Menese wallet",
    acceptsArgs: true,
    handler: async (ctx) => {
      const args = ctx.args?.trim() ?? "";
      const senderId = ctx.senderId ?? "unknown";

      // Check if already set up
      const existing = store.getEntry(ctx.channel, senderId);
      if (existing?.identitySeed && !args) {
        const addrRes = await getAllAddresses(config, existing.principal);
        const evm = addrRes.ok ? (addrRes.data.evm?.evmAddress ?? "—") : "—";
        return {
          text:
            `You already have a wallet.\n\n` +
            `**Principal:** \`${existing.principal}\`\n` +
            `**ETH:** \`${evm}\`\n\n` +
            "To create a new wallet, run `/setup new`\n" +
            "To unlink, run `/link-wallet unlink`",
        };
      }

      // Handle subcommands
      let seed: string;
      if (args.startsWith("import ")) {
        const hexSeed = args.slice(7).trim();
        if (!/^[0-9a-fA-F]{64}$/.test(hexSeed)) {
          return {
            text:
              "Invalid seed format. Expected 64 hex characters (32 bytes).\n\n" +
              "Example: `/setup import a1b2c3d4...` (64 hex chars)",
            isError: true,
          };
        }
        seed = hexSeed.toLowerCase();
      } else if (args === "new") {
        if (existing?.identitySeed) {
          return {
            text:
              "⚠️ **This will replace your current wallet.**\n\n" +
              `Current principal: \`${existing.principal}\`\n\n` +
              "If you have funds in this wallet, **back up your seed first** — it cannot be recovered.\n\n" +
              "To confirm, run `/setup new confirm`",
          };
        }
        seed = generateSeed();
      } else if (args === "new confirm") {
        seed = generateSeed();
      } else if (!args) {
        seed = generateSeed();
      } else {
        return {
          text:
            "Usage:\n" +
            "- `/setup` — create a new wallet\n" +
            "- `/setup new` — create a new wallet (replaces existing)\n" +
            "- `/setup import <hex-seed>` — import from a 32-byte hex seed",
          isError: true,
        };
      }

      // Derive principal from seed
      const principal = getPrincipalFromSeed(seed);

      // Store identity
      store.link(ctx.channel, senderId, principal);
      store.setSeed(ctx.channel, senderId, seed);
      store.markVerified(ctx.channel, senderId);

      // Fetch addresses from SDK canister
      const addrRes = await getAllAddresses(config, principal);

      if (!addrRes.ok) {
        return {
          text:
            `Wallet created but could not fetch addresses.\n\n` +
            `**Principal:** \`${principal}\`\n` +
            `Reason: ${addrRes.error}\n\n` +
            "Your wallet is ready. Try again later to see your addresses.",
        };
      }

      const evm = addrRes.data.evm?.evmAddress ?? "—";
      const sol = addrRes.data.solana?.address ?? "—";
      const btc = addrRes.data.bitcoin?.bech32Address ?? "—";

      return {
        text:
          "**Wallet created!**\n\n" +
          `**Principal:** \`${principal}\`\n` +
          `**ETH:** \`${evm}\`\n` +
          `**SOL:** \`${sol}\`\n` +
          `**BTC:** \`${btc}\`\n\n` +
          "**Free features** — try now:\n" +
          "- *\"Show me my portfolio\"*\n" +
          "- *\"What's the price of ETH?\"*\n" +
          "- *\"Show me my addresses\"*\n\n" +
          "**Send, swap, stake & strategies** require a Menese subscription.\n" +
          "Run `/subscribe` to see plans, then fund your addresses to start.",
      };
    },
  });
}
