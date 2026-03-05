import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { getGatewayAccount, purchaseSubscription, depositCredits, getPrincipalFromSeed } from "../ic-client.js";

const TIERS = ["basic", "developer", "pro", "enterprise"] as const;

const TIER_INFO: Record<string, { price: string; actions: string }> = {
  basic: { price: "$20/mo", actions: "100" },
  developer: { price: "$45.50/mo", actions: "1,000" },
  pro: { price: "$128.70/mo", actions: "5,000" },
  enterprise: { price: "$323.70/mo", actions: "Unlimited" },
};

/**
 * /subscribe [subcommand] — View plans, deposit credits, or purchase a subscription.
 *
 * Usage:
 *   /subscribe              — show plans + current account status
 *   /subscribe status       — show current account status only
 *   /subscribe deposit <N>  — deposit N ICP as credits (converted to USD)
 *   /subscribe <tier>       — purchase a subscription tier (basic/developer/pro/enterprise)
 */
export function registerSubscribeCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "subscribe",
    description: "Manage Menese SDK subscription (view plans, check status, purchase)",
    acceptsArgs: true,
    handler: async (ctx) => {
      const senderId = ctx.senderId ?? "unknown";
      const seed = store.getSeed(ctx.channel, senderId);
      if (!seed) {
        return {
          text: "No wallet linked. Run `/setup` first to connect your ICP principal.",
          isError: true,
        };
      }

      const arg = (ctx.args ?? "").trim().toLowerCase();

      // /subscribe status — show account info
      if (arg === "status" || arg === "") {
        const acct = await getGatewayAccount(config, seed);
        if (!acct.ok) {
          // Account not yet created on SDK — show plans
          const lines = TIERS.map((t) => {
            const info = TIER_INFO[t];
            return `- **${t}** — ${info.price} (${info.actions} actions/month)`;
          }).join("\n");

          return {
            text:
              "**Available plans:**\n" +
              lines +
              "\n\n**How to subscribe:**\n" +
              "1. Fund your wallet — send ICP to your bot address (see `/verify`)\n" +
              "2. `/subscribe deposit <amount>` — convert ICP to USD credits\n" +
              "3. `/subscribe <tier>` — activate a plan\n" +
              (acct.error ? `\n_Note: ${acct.error}_` : ""),
          };
        }

        const d = acct.data;
        const creditsUsd = (Number(d.creditsMicroUsd) / 1_000_000).toFixed(2);
        const depositedUsd = (Number(d.totalDepositedMicroUsd) / 1_000_000).toFixed(2);
        const expiry = d.subscriptionExpiry
          ? new Date(Number(d.subscriptionExpiry) / 1_000_000).toISOString().slice(0, 10)
          : "—";

        let status =
          `**Your Account:**\n` +
          `- Tier: **${d.tier}**\n` +
          `- Actions remaining: **${d.actionsRemaining.toString()}**\n` +
          `- Actions used: ${d.actionsUsed.toString()}\n` +
          `- Credits: $${creditsUsd}\n` +
          `- Total deposited: $${depositedUsd}\n` +
          `- Subscription expires: ${expiry}`;

        if (arg === "") {
          const lines = TIERS.map((t) => {
            const info = TIER_INFO[t];
            return `- **${t}** — ${info.price} (${info.actions} actions/month)`;
          }).join("\n");
          status += `\n\n**Available plans:**\n${lines}\n\nDeposit: \`/subscribe deposit <amount>\` · Upgrade: \`/subscribe <tier>\``;
        }

        return { text: status };
      }

      // /subscribe deposit <amount> — deposit ICP as credits
      if (arg.startsWith("deposit")) {
        const amountStr = arg.replace("deposit", "").trim();
        const amountNum = parseFloat(amountStr);
        if (!amountStr || isNaN(amountNum) || amountNum <= 0) {
          const principal = getPrincipalFromSeed(seed);
          return {
            text:
              `**How to deposit credits:**\n\n` +
              `1. Send ICP to your bot wallet:\n` +
              `   \`${principal}\`\n\n` +
              `2. Then run:\n` +
              `   \`/subscribe deposit <amount>\`\n` +
              `   e.g. \`/subscribe deposit 2\` to deposit 2 ICP\n\n` +
              `The SDK converts ICP to USD credits at the current exchange rate.`,
          };
        }
        // Convert to e8s (ICP has 8 decimals)
        const e8s = BigInt(Math.round(amountNum * 1e8));
        const res = await depositCredits(config, seed, "ICP", e8s);
        if (!res.ok) {
          return {
            text: `Deposit failed: ${res.error}\n\nMake sure you have at least ${amountStr} ICP in your bot wallet. Check with \`/verify\`.`,
            isError: true,
          };
        }
        const usd = (Number(res.data.usdValueMicroUsd) / 1_000_000).toFixed(2);
        return {
          text:
            `Deposited ${amountStr} ICP → **$${usd}** credits added.\n\n` +
            `Now run \`/subscribe <tier>\` to activate a plan (e.g. \`/subscribe basic\`).`,
        };
      }

      // /subscribe <tier> — purchase
      if (!(TIERS as readonly string[]).includes(arg)) {
        return {
          text: `Unknown tier: "${arg}". Valid tiers: ${TIERS.join(", ")}\n\nOther commands: \`/subscribe deposit <amount>\`, \`/subscribe status\``,
          isError: true,
        };
      }

      const res = await purchaseSubscription(config, seed, arg, "ICP");
      if (!res.ok) {
        return {
          text: `Subscription purchase failed: ${res.error}\n\nMake sure you have enough credits. You can deposit ICP to your SDK account first.`,
          isError: true,
        };
      }

      const d = res.data;
      const expiry = d.subscriptionExpiry
        ? new Date(Number(d.subscriptionExpiry) / 1_000_000).toISOString().slice(0, 10)
        : "—";

      return {
        text:
          `Subscribed to **${d.tier}** tier!\n\n` +
          `- Actions remaining: **${d.actionsRemaining.toString()}**\n` +
          `- Expires: ${expiry}\n` +
          `- Credits balance: $${(Number(d.creditsMicroUsd) / 1_000_000).toFixed(2)}`,
      };
    },
  });
}
