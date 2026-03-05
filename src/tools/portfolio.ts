import { Type } from "@sinclair/typebox";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { getPortfolio, getAllICRC1Balances } from "../ic-client.js";
import { jsonResult } from "./_helpers.js";
import { cacheFetch, CacheKeys, TTL } from "../cache.js";

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

      const seed = store.getSeed("tool", "current");
      const res = await cacheFetch(
        CacheKeys.portfolio(principal),
        TTL.PORTFOLIO,
        () => getPortfolio(config, principal, seed ?? undefined),
      );
      if (!res.ok) {
        return jsonResult({ error: res.error });
      }
      const result: Record<string, unknown> = {
        principal,
        balances: res.data,
        chainCount: res.data.length,
      };
      if (res.errors && res.errors.length > 0) {
        result.failedChains = res.errors;
        result.failedCount = res.errors.length;
      }
      // Fetch ICRC-1 token balances (ckUSDC, ckBTC, etc.)
      if (seed) {
        const tokens = await getAllICRC1Balances(config, seed);
        if (tokens.length > 0) {
          result.icpTokens = tokens;
        }
      }
      return jsonResult(result);
    },
  };
}
