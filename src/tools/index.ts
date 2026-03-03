import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { createBalanceTool } from "./balance.js";
import { createPricesTool } from "./prices.js";
import { createPortfolioTool } from "./portfolio.js";
import { createHistoryTool } from "./history.js";
import { createQuoteTool } from "./quote.js";
import { createSendTool } from "./send.js";
import { createSwapTool } from "./swap.js";
import { createBridgeTool } from "./bridge.js";
import { createStakeTool } from "./stake.js";
import { createLendTool } from "./lend.js";
import { createLiquidityTool } from "./liquidity.js";
import { createStrategyTool } from "./strategy.js";
import { createJobsTool } from "./jobs.js";

export function registerMeneseTools(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  const tools = [
    createBalanceTool,
    createPricesTool,
    createPortfolioTool,
    createHistoryTool,
    createQuoteTool,
    createSendTool,
    createSwapTool,
    createBridgeTool,
    createStakeTool,
    createLendTool,
    createLiquidityTool,
    createStrategyTool,
    createJobsTool,
  ];

  for (const createTool of tools) {
    const tool = createTool(config, store);
    api.registerTool(tool);
  }
}
