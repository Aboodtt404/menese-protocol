import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { isValidPrincipal } from "../store.js";
import { querySdk } from "../sdk-client.js";

/**
 * /link-wallet <principal|unlink> — Direct wallet linking or unlinking.
 *
 * For users who already know their principal and want to link/unlink quickly.
 * Links as unverified — user must still run /verify to prove ownership.
 */
export function registerLinkWalletCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "link-wallet",
    description: "Link or unlink your ICP principal to this channel",
    acceptsArgs: true,
    handler: async (ctx) => {
      const arg = ctx.args?.trim();

      if (!arg) {
        return {
          text: "Usage: `/link-wallet <principal>` or `/link-wallet unlink`",
          isError: true,
        };
      }

      const senderId = ctx.senderId ?? "unknown";

      if (arg.toLowerCase() === "unlink") {
        const existing = store.resolve(ctx.channel, senderId);
        if (!existing) {
          return { text: "No wallet is currently linked." };
        }
        store.unlink(ctx.channel, senderId);
        return { text: `Wallet unlinked. Was: \`${existing}\`` };
      }

      if (!isValidPrincipal(arg)) {
        return {
          text:
            `Invalid principal: \`${arg}\`\n` +
            "Expected ICP principal format: groups of 5 base32 chars (a-z, 2-7) separated by dashes.\n" +
            "Example: `ewcc5-fiaaa-aaaab-afafq-cai`",
          isError: true,
        };
      }

      store.link(ctx.channel, senderId, arg);

      // Fetch all addresses — the EVM address is the ownership challenge
      const addrRes = await querySdk<{ evm?: { evmAddress?: string } }>(
        `addresses`,
        config,
        { principal: arg },
      );

      if (!addrRes.ok) {
        const truncated = arg.length > 20 ? `${arg.slice(0, 10)}...${arg.slice(-10)}` : arg;
        return {
          text:
            `Wallet linked (unverified): \`${truncated}\`\n\n` +
            "Could not fetch derived address for verification. Run `/setup` to retry.\n" +
            "Until verified, only read operations (balance, prices) are available.",
        };
      }

      const ethAddress = (addrRes.data as { evm?: { evmAddress?: string } }).evm?.evmAddress;
      if (!ethAddress) {
        const truncated = arg.length > 20 ? `${arg.slice(0, 10)}...${arg.slice(-10)}` : arg;
        return {
          text:
            `Wallet linked (unverified): \`${truncated}\`\n\n` +
            "Could not derive your Ethereum address. Run `/setup` to retry.\n" +
            "Until verified, only read operations (balance, prices) are available.",
        };
      }
      store.setChallenge(ctx.channel, senderId, ethAddress);

      const truncated = arg.length > 20 ? `${arg.slice(0, 10)}...${arg.slice(-10)}` : arg;
      return {
        text:
          `Wallet linked (unverified): \`${truncated}\`\n\n` +
          "Run `/verify <your-ethereum-address>` to prove ownership and unlock transactions.",
      };
    },
  });
}
