import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";

/**
 * /verify <ethereum-address> — Prove ownership of the linked ICP principal.
 *
 * During /setup the plugin derives the Ethereum address that only the
 * principal's owner could know (computed via threshold ECDSA on the canister).
 * The user must provide that address back here to prove they own the principal.
 */

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function registerVerifyCommand(
  api: OpenClawPluginApi,
  _config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "verify",
    description: "Prove wallet ownership by providing your derived Ethereum address",
    acceptsArgs: true,
    handler: (ctx) => {
      const address = ctx.args?.trim();
      const senderId = ctx.senderId ?? "unknown";

      if (!address) {
        return {
          text:
            "Usage: `/verify <ethereum-address>`\n\n" +
            "After running `/setup`, you received a challenge. " +
            "Provide the Ethereum address derived from your principal to prove ownership.",
          isError: true,
        };
      }

      const entry = store.getEntry(ctx.channel, senderId);
      if (!entry) {
        return {
          text: "No wallet linked. Run `/setup <principal>` first.",
          isError: true,
        };
      }

      if (entry.verified) {
        return { text: `Your wallet is already verified. Principal: \`${entry.principal}\`` };
      }

      if (!entry.challengeAddress) {
        return {
          text:
            "No verification challenge found. This can happen if your wallet was linked before the verification system was added.\n\n" +
            "Run `/setup <your-principal>` again to start the verification flow.",
          isError: true,
        };
      }

      if (!ETH_ADDRESS_RE.test(address)) {
        return {
          text:
            `Invalid Ethereum address format: \`${address}\`\n\n` +
            "Expected a 0x-prefixed hex address (42 characters).\n" +
            "Example: `0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18`",
          isError: true,
        };
      }

      if (address.toLowerCase() !== entry.challengeAddress) {
        return {
          text:
            "Verification failed — the address does not match.\n\n" +
            "Make sure you are providing the **Ethereum address** derived from your ICP principal. " +
            "You can find it in your NNS wallet or by checking your Menese account.\n\n" +
            "If you entered the wrong principal during `/setup`, run `/setup <correct-principal>` to start over.",
          isError: true,
        };
      }

      store.markVerified(ctx.channel, senderId);

      return {
        text:
          "Wallet verified! You now have full access to all Menese operations.\n\n" +
          "You can:\n" +
          "- Send tokens: *\"Send 0.1 ETH to 0x...\"*\n" +
          "- Swap tokens: *\"Swap 1 ETH for USDC\"*\n" +
          "- Bridge assets: *\"Bridge 100 USDC from Ethereum to Solana\"*\n" +
          "- Stake, lend, create strategies, and more.",
      };
    },
  });
}
