import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { registerSetupCommand } from "./setup.js";
import { registerLinkWalletCommand } from "./link-wallet.js";
import { registerPortfolioCommand } from "./portfolio.js";
import { registerHistoryCommand } from "./history.js";
import { registerStrategyCommand } from "./strategy.js";
import { registerSubscribeCommand } from "./subscribe.js";
import { registerVerifyCommand } from "./verify.js";

export function registerMeneseCommands(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  registerSetupCommand(api, config, store);
  registerLinkWalletCommand(api, config, store);
  registerVerifyCommand(api, config, store);
  registerPortfolioCommand(api, config, store);
  registerHistoryCommand(api, config, store);
  registerStrategyCommand(api, config, store);
  registerSubscribeCommand(api, config, store);
}
