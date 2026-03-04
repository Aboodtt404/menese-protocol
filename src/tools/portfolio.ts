import { Type } from "@sinclair/typebox";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { getPortfolio } from "../ic-client.js";
import { jsonResult } from "./_helpers.js";

export function createPortfolioTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_portfolio",
    label: "Menese Portfolio",
    description:
      "Get a complete portfolio overview across all blockchains. Shows balances and addresses.",
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: Record<string, never>) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }

      const res = await getPortfolio(config, principal);
      if (!res.ok) {
        return jsonResult({ error: res.error });
      }
      return jsonResult({ principal, balances: res.data });
    },
  };
}
