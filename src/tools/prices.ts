import { Type } from "@sinclair/typebox";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { jsonResult } from "./_helpers.js";
import { cacheFetch, CacheKeys, TTL } from "../cache.js";

// Map common symbols to CoinGecko IDs
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", ICP: "internet-computer",
  MATIC: "matic-network", ARB: "arbitrum", BNB: "binancecoin", AVAX: "avalanche-2",
  SUI: "sui", TON: "the-open-network", XRP: "ripple", ADA: "cardano",
  DOT: "polkadot", ATOM: "cosmos", NEAR: "near", APT: "aptos",
  LTC: "litecoin", RUNE: "thorchain", TRX: "tron", OP: "optimism",
  USDC: "usd-coin", USDT: "tether", DAI: "dai",
};

export function createPricesTool(_config: MeneseConfig, _store: IdentityStore) {
  return {
    name: "menese_prices",
    label: "Menese Prices",
    description:
      "Get current prices for one or more tokens. Returns USD prices. No wallet required.",
    parameters: Type.Object({
      tokens: Type.Array(Type.String({ description: "Token symbols, e.g. 'ETH', 'BTC', 'SOL'" }), {
        description: "List of token symbols to look up",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: { tokens: string[] },
    ) {
      const symbols = params.tokens.map((t) => t.toUpperCase());
      const ids = symbols
        .map((s) => COINGECKO_IDS[s])
        .filter((id): id is string => !!id);

      if (ids.length === 0) {
        return jsonResult({ error: `Unknown token symbols: ${symbols.join(", ")}` });
      }

      try {
        const idsKey = ids.slice().sort().join(",");
        const data = await cacheFetch(
          CacheKeys.prices(idsKey),
          TTL.PRICES,
          async () => {
            const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`;
            const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
          },
        );

        // Map back to symbols
        const prices: Record<string, { usd: number; change24h?: number }> = {};
        for (const sym of symbols) {
          const id = COINGECKO_IDS[sym];
          if (id && data[id]) {
            prices[sym] = {
              usd: data[id].usd ?? 0,
              change24h: data[id].usd_24h_change,
            };
          }
        }

        return jsonResult({ prices });
      } catch (err) {
        return jsonResult({ error: `Failed to fetch prices: ${err}` });
      }
    },
  };
}
