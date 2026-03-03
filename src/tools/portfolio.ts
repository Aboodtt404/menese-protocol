import { Type } from "@sinclair/typebox";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { querySdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

export function createPortfolioTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_portfolio",
    label: "Menese Portfolio",
    description:
      "Get a complete portfolio overview across all blockchains. Shows balances, USD values, and total net worth.",
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: Record<string, never>) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }

      const res = await querySdk("balances", config, { principal });
      return sdkToResult(res);
    },
  };
}
