import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { parseMeneseConfig, type MeneseConfig } from "./src/config.js";
import { createIdentityStore } from "./src/store.js";
import { registerMeneseTools } from "./src/tools/index.js";
import { registerTransactionGuard } from "./src/hooks/transaction-guard.js";
import { registerAuditLogger } from "./src/hooks/audit-logger.js";
import { registerMeneseCommands } from "./src/commands/index.js";
import { registerMeneseWebhook } from "./src/http/webhook.js";

const meneseConfigSchema = {
  parse(value: unknown): MeneseConfig {
    return parseMeneseConfig(value);
  },
  uiHints: {
    sdkCanisterId: {
      label: "SDK Canister ID",
      placeholder: "urs2a-ziaaa-aaaad-aembq-cai",
      help: "The MeneseSDK canister ID. Default is the production SDK canister.",
    },
    relayUrl: {
      label: "VPS Relay URL",
      placeholder: "http://localhost:18791",
      help: "HTTP endpoint of the VPS relay (reserved for future use).",
    },
    autoApproveThreshold: {
      label: "Auto-Approve Threshold (USD)",
      help: "Transactions below this USD value skip the confirmation prompt. 0 = always confirm.",
      advanced: true,
    },
    developerKey: {
      label: "Developer Key",
      placeholder: "msk_...",
      sensitive: true,
      help: "Menese developer API key for authenticated relay access.",
    },
    factoryCanisterId: {
      label: "Factory Canister ID",
      help: "MeneseAgent factory canister ID. Required for /deploy-agent to create new agent canisters.",
      advanced: true,
    },
    factoryAdminSeed: {
      label: "Factory Admin Seed",
      sensitive: true,
      help: "Ed25519 hex seed for the factory admin identity. Required for spawning agent canisters.",
      advanced: true,
    },
    testMode: {
      label: "Test Mode",
      help: "When enabled, uses the test SDK canister instead of production.",
      advanced: true,
    },
  },
};

const meneseProtocolPlugin = {
  id: "menese-protocol",
  name: "Menese Protocol",
  description:
    "Multi-chain crypto wallet, swaps, bridges, lending & strategies via Menese SDK",
  configSchema: meneseConfigSchema,

  register(api: OpenClawPluginApi) {
    const config = meneseConfigSchema.parse(api.pluginConfig);

    api.logger.info?.(
      `[menese] Loaded — canister=${config.sdkCanisterId} relay=${config.relayUrl} test=${config.testMode}`,
    );

    const stateDir = api.runtime.state.resolveStateDir();
    const store = createIdentityStore(stateDir);

    registerMeneseTools(api, config, store);

    registerTransactionGuard(api, config);
    registerAuditLogger(api, config);

    registerMeneseCommands(api, config, store);

    registerMeneseWebhook(api, config);

    api.on("before_prompt_build", async (_event, _ctx) => ({
      prependContext: MENESE_AGENT_CONTEXT,
    }));
  },
};

export default meneseProtocolPlugin;

const MENESE_AGENT_CONTEXT = `## Menese Protocol — Tool Instructions

You have menese_* tools for multi-chain crypto operations. ALWAYS use these registered tools — never use exec/bash, dfx, or python scripts for wallet operations.

**Setup:** Users run /setup to create a bot-managed wallet. No external principal or agent canister needed — the bot generates an Ed25519 identity and signs SDK canister calls directly.

**Read operations** (no wallet needed for prices):
- \`menese_portfolio\` — full portfolio across all chains
- \`menese_balance\` — balance for a specific chain (param: chain)
- \`menese_prices\` — token USD prices via CoinGecko (param: tokens array e.g. ["ETH","BTC"])
- \`menese_quote\` — check balances and addresses (params: action:"balance"|"addresses", chain)

**Write operations** (wallet required — run /setup first):
- \`menese_send\` — send tokens (params: chain, to, amount)
- \`menese_swap\` — swap tokens on EVM chains (params: chain, fromToken, toToken, amount, slippageBps)
- \`menese_bridge\` — cross-chain bridge (coming soon)
- \`menese_lend\` — Aave V3 supply/withdraw (params: chain, action, asset, amount)
- \`menese_stake\` — Lido staking (params: chain, action, protocol, amount)
- \`menese_liquidity\` — DEX liquidity (coming soon)

**Automation:**
- \`menese_strategy\` — automated strategies via SDK rules (params: action:"create"|"list"|"cancel", strategyType:"dca"|"take_profit"|"stop_loss", chain, amount, intervalSeconds, targetPrice, ruleId)
- \`menese_jobs\` — manage scheduled jobs on an agent canister (params: action:"list"|"create"|"pause"|"resume"|"delete", name, jobType:"recurring"|"oneshot"|"conditional", chain, fromToken, toToken, amount, intervalSeconds, conditionType, conditionToken, conditionThreshold, jobId). Requires agent canister (/deploy-agent link <id>).

**Agent Canister (optional — enables on-chain automation):**
- When an agent canister is linked, DCA/take-profit/stop-loss strategies auto-route to agent jobs (persistent on-chain scheduling)
- Without an agent, strategies use SDK's built-in rule engine
- Deploy flow: /deploy-agent → pick tier → deposit ICP → /deploy-agent check → /deploy-agent create
- Tiers: starter (0.5 ICP), professional (2 ICP), enterprise (5 ICP) — converted to cycles to power the canister
- Agent commands: /deploy-agent (tiers/status), /deploy-agent <tier> (deposit address), /deploy-agent check (verify deposit), /deploy-agent create (spawn canister), /deploy-agent link <id> (link existing), /deploy-agent unlink

**User commands:** /setup (create wallet), /setup import <hex-seed> (import existing), /verify (check status), /link-wallet, /portfolio, /subscribe, /deploy-agent

**Caching (built-in, automatic):**
- Prices are cached for 60s (CoinGecko rate limits)
- Balances and portfolio are cached for 30s
- Wallet addresses are cached permanently (they never change)
- After any write operation (send/swap/stake/lend), balance caches are automatically invalidated so the next read gets fresh data
- If the user asks whether data is cached: yes, read operations use in-memory caching for speed. Write operations always hit the chain live and bust the cache afterward.

**Rules:**
- If no wallet is set up, tell the user to run /setup
- Read operations (portfolio, balance, prices) work with just a linked wallet
- Write operations require the bot-managed identity (/setup creates this automatically)
- For send/swap: confirm details with the user before executing
- For strategies: confirm strategy details before creating
- Supported chains: ethereum, polygon, arbitrum, base, optimism, bnb, solana, bitcoin, litecoin, icp, sui, ton, xrp, cardano, tron, aptos, near, cloakcoin, thorchain
`;
