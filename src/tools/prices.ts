import { Type } from "@sinclair/typebox";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { querySdk } from "../sdk-client.js";
import { sdkToResult } from "./_helpers.js";

export function createPricesTool(config: MeneseConfig, _store: IdentityStore) {
  return {
    name: "menese_prices",
    label: "Menese Prices",
    description:
      "Get current prices for one or more tokens. Returns USD prices and 24h change. No wallet required.",
    parameters: Type.Object({
      tokens: Type.Array(Type.String({ description: "Token symbols, e.g. 'ETH', 'BTC', 'SOL'" }), {
        description: "List of token symbols to look up",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: { tokens: string[] },
    ) {
      const tokenList = params.tokens.map((t) => t.toUpperCase()).join(",");
      const res = await querySdk(
        `strategy/prices?tokens=${encodeURIComponent(tokenList)}`,
        config,
      );
      return sdkToResult(res);
    },
  };
}
