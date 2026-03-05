import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import {
  getDepositInfo,
  checkDepositBalance,
  adminSpawnFor,
  getMyAgents,
  TIERS,
  isValidTier,
  type TierName,
} from "../factory-client.js";
import { checkAgentHealth } from "../agent-client.js";

/**
 * /deploy-agent — Deploy or manage a MeneseAgent canister.
 *
 * Flow:
 *   /deploy-agent                   — show status or tier selection
 *   /deploy-agent <tier>            — get deposit address + amount for tier
 *   /deploy-agent check             — check if deposit is funded
 *   /deploy-agent create            — create agent canister (once funded)
 *   /deploy-agent unlink            — disconnect agent (keeps canister alive)
 */
export function registerDeployAgentCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "deploy-agent",
    description: "Deploy your own MeneseAgent canister for on-chain automation",
    acceptsArgs: true,
    handler: async (ctx) => {
      const args = ctx.args?.trim() ?? "";
      const senderId = ctx.senderId ?? "unknown";

      const entry = store.getEntry(ctx.channel, senderId);
      if (!entry?.identitySeed) {
        return {
          text: "No wallet set up. Run `/setup` first, then deploy an agent.",
          isError: true,
        };
      }

      const factoryId = config.factoryCanisterId;
      const adminSeed = config.factoryAdminSeed;

      // ── /deploy-agent (no args) — show status or tier menu ──
      if (!args) {
        // Check if already has an agent
        const agentInfo = store.getAgent(ctx.channel, senderId);
        if (agentInfo) {
          const health = await checkAgentHealth(agentInfo.canisterId);
          return {
            text:
              `**Agent Status:** Connected\n\n` +
              `Canister: \`${agentInfo.canisterId}\`\n` +
              `Health: ${health.ok ? health.data : "unreachable"}\n\n` +
              `Your agent canister needs ICP/cycles to stay alive. Top it up periodically.\n\n` +
              `Commands:\n` +
              `- \`/deploy-agent unlink\` — disconnect (canister stays alive)`,
          };
        }

        // No agent — show tier options
        const tierList = Object.entries(TIERS)
          .map(([key, t]) => `- **${t.label}** (\`/deploy-agent ${key}\`) — ${t.icp} ICP → ${t.cycles} cycles — ${t.desc}`)
          .join("\n");

        return {
          text:
            `**Deploy a MeneseAgent Canister**\n\n` +
            `An agent canister gives you on-chain automation: DCA, take-profit, stop-loss jobs that run 24/7 even when the bot is offline.\n\n` +
            `**Choose a tier:**\n${tierList}\n\n` +
            `Run \`/deploy-agent <tier>\` to get your deposit address.`,
        };
      }

      // ── /deploy-agent unlink ──
      if (args === "unlink") {
        const agentInfo = store.getAgent(ctx.channel, senderId);
        if (!agentInfo) {
          return { text: "No agent canister is linked.", isError: true };
        }
        store.clearAgent(ctx.channel, senderId);
        return {
          text:
            `Agent canister \`${agentInfo.canisterId}\` unlinked.\n` +
            `The canister is still running — you can re-link it anytime with \`/deploy-agent link ${agentInfo.canisterId}\`.`,
        };
      }

      // ── /deploy-agent link <canisterId> ──
      if (args.startsWith("link ")) {
        const canisterId = args.slice(5).trim();
        if (!canisterId || !canisterId.includes("-")) {
          return { text: "Usage: `/deploy-agent link <canisterId>`", isError: true };
        }
        const health = await checkAgentHealth(canisterId);
        if (!health.ok) {
          return { text: `Cannot reach agent canister \`${canisterId}\`:\n${health.error}`, isError: true };
        }
        store.setAgent(ctx.channel, senderId, canisterId);
        return {
          text:
            `Agent canister linked: \`${canisterId}\`\n\n` +
            `DCA, take-profit, and stop-loss strategies will now run as on-chain agent jobs.`,
        };
      }

      // Everything below requires factory config
      if (!factoryId || !adminSeed) {
        return {
          text: "Agent factory is not configured. Ask the admin to set `factoryCanisterId` and `factoryAdminSeed` in the plugin config.",
          isError: true,
        };
      }

      // ── /deploy-agent <tier> — get deposit info ──
      if (isValidTier(args)) {
        const tier = args as TierName;
        const tierInfo = TIERS[tier];
        const res = await getDepositInfo(factoryId, entry.principal, tier);
        if (!res.ok) {
          return { text: `Failed to get deposit info: ${res.error}`, isError: true };
        }
        const { accountIdHex, amountE8s } = res.data;
        const icpAmount = Number(amountE8s) / 1e8;
        return {
          text:
            `**${tierInfo.label} Agent — Deposit Required**\n\n` +
            `Send **${icpAmount} ICP** to this account:\n` +
            `\`${accountIdHex}\`\n\n` +
            `This ICP is converted to **${tierInfo.cycles} cycles** to power your agent canister.\n\n` +
            `After sending, run \`/deploy-agent check\` to verify the deposit, ` +
            `then \`/deploy-agent create\` to launch your agent.`,
        };
      }

      // ── /deploy-agent check — check deposit status ──
      if (args === "check") {
        // Try all tiers to find a funded one
        for (const [tierKey, tierInfo] of Object.entries(TIERS)) {
          const res = await checkDepositBalance(factoryId, entry.principal, tierKey as TierName);
          if (res.ok && res.data.funded) {
            const balanceIcp = Number(res.data.balance) / 1e8;
            return {
              text:
                `**Deposit found!** ${tierInfo.label} tier\n\n` +
                `Balance: ${balanceIcp} ICP (required: ${tierInfo.icp} ICP)\n\n` +
                `Run \`/deploy-agent create\` to launch your agent canister.`,
            };
          }
          if (res.ok && res.data.balance > 0n) {
            const balanceIcp = Number(res.data.balance) / 1e8;
            const requiredIcp = Number(res.data.required) / 1e8;
            return {
              text:
                `**Partial deposit detected**\n\n` +
                `Balance: ${balanceIcp} ICP\n` +
                `Required for ${tierInfo.label}: ${requiredIcp} ICP\n\n` +
                `Send the remaining ${requiredIcp - balanceIcp} ICP to complete the deposit.`,
            };
          }
        }
        return {
          text:
            "No deposit found. Run `/deploy-agent <tier>` first to get your deposit address, " +
            "then send ICP to it.",
          isError: true,
        };
      }

      // ── /deploy-agent create — spawn the agent canister ──
      if (args === "create") {
        // Check existing agents first
        const existingRes = await getMyAgents(factoryId, entry.principal);
        if (existingRes.ok && existingRes.data.length > 0) {
          const existing = existingRes.data[0]!;
          const cid = existing.canisterId.toText();
          // Auto-link if not already linked
          if (!store.getAgent(ctx.channel, senderId)) {
            store.setAgent(ctx.channel, senderId, cid);
          }
          return {
            text:
              `You already have an agent canister: \`${cid}\`\n\n` +
              `It has been linked to your wallet. Use strategies and jobs as normal.`,
          };
        }

        // Find funded tier
        let fundedTier: TierName | null = null;
        for (const tierKey of Object.keys(TIERS) as TierName[]) {
          const res = await checkDepositBalance(factoryId, entry.principal, tierKey);
          if (res.ok && res.data.funded) {
            fundedTier = tierKey;
            break;
          }
        }

        if (!fundedTier) {
          return {
            text: "No funded deposit found. Run `/deploy-agent <tier>` to get your deposit address, send ICP, then try again.",
            isError: true,
          };
        }

        // Spawn!
        const spawnRes = await adminSpawnFor(
          factoryId,
          adminSeed,
          entry.principal,
          `Agent for ${senderId}`,
          `Auto-deployed via Menese bot`,
          fundedTier,
        );

        if (!spawnRes.ok) {
          return { text: `Failed to create agent: ${spawnRes.error}`, isError: true };
        }

        const { canisterId, cyclesAllocated } = spawnRes.data;
        const cid = canisterId.toText();
        const cyclesT = Number(cyclesAllocated) / 1e12;

        // Auto-link
        store.setAgent(ctx.channel, senderId, cid);

        return {
          text:
            `**Agent Canister Deployed!**\n\n` +
            `Canister: \`${cid}\`\n` +
            `Cycles: ${cyclesT.toFixed(1)}T\n` +
            `Tier: ${TIERS[fundedTier].label}\n\n` +
            `Your agent is now live and linked to your wallet.\n` +
            `DCA, take-profit, and stop-loss strategies will run on-chain 24/7.\n\n` +
            `**Important:** Your agent canister consumes cycles. Top it up with ICP periodically to keep it running.`,
        };
      }

      return {
        text:
          "Unknown subcommand.\n\n" +
          "Usage:\n" +
          "- `/deploy-agent` — show tiers or status\n" +
          "- `/deploy-agent <tier>` — get deposit address (starter/professional/enterprise)\n" +
          "- `/deploy-agent check` — verify deposit\n" +
          "- `/deploy-agent create` — launch agent canister\n" +
          "- `/deploy-agent link <canisterId>` — link existing agent\n" +
          "- `/deploy-agent unlink` — disconnect agent",
        isError: true,
      };
    },
  });
}
