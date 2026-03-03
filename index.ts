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
      placeholder: "ewcc5-fiaaa-aaaab-afafq-cai",
      help: "The MeneseAgent canister ID. Default is the production agent canister.",
    },
    relayUrl: {
      label: "VPS Relay URL",
      placeholder: "http://localhost:18791",
      help: "HTTP endpoint of the VPS relay that forwards calls to the SDK canister.",
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

    // Phase 2: Identity store
    const stateDir = api.runtime.state.resolveStateDir();
    const store = createIdentityStore(stateDir);

    // Phase 3: Tools
    registerMeneseTools(api, config, store);

    // Phase 4: Hooks
    registerTransactionGuard(api, config);
    registerAuditLogger(api, config);

    // Phase 5: Commands
    registerMeneseCommands(api, config, store);

    // Phase 6: Webhook
    registerMeneseWebhook(api, config);
  },
};

export default meneseProtocolPlugin;
