import { Type } from "@sinclair/typebox";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { getPortfolio, getAllICRC1Balances } from "../ic-client.js";
import { jsonResult, cardResult } from "./_helpers.js";
import { cacheFetch, CacheKeys, TTL } from "../cache.js";

export function createPortfolioTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_portfolio",
    label: "Menese Portfolio",
    description:
      "Get a complete portfolio overview across all blockchains. Shows balances and addresses.\n\n" +
      "IMPORTANT: The result is already formatted. Display it exactly as returned inside a code block. Do NOT reformat, add emojis, or build tables.",
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
      return cardResult(formatPortfolio(result), result);
    },
  };
}

function formatPortfolio(data: Record<string, unknown>): string {
  const lines: string[] = ["PORTFOLIO"];
  lines.push("─".repeat(40));

  const balances = data.balances as Array<{ chain: string; balance: string | number; usdValue?: number }> | undefined;
  if (balances && balances.length > 0) {
    // Active balances first
    const active = balances.filter(b => {
      const bal = typeof b.balance === "number" ? b.balance : parseFloat(String(b.balance));
      return bal > 0;
    });
    const zeros = balances.filter(b => {
      const bal = typeof b.balance === "number" ? b.balance : parseFloat(String(b.balance));
      return bal === 0;
    });

    for (const b of active) {
      const bal = typeof b.balance === "number" ? b.balance : parseFloat(String(b.balance));
      const balStr = bal.toFixed(6).replace(/\.?0+$/, "");
      const usd = b.usdValue ? ` (~$${b.usdValue.toFixed(2)})` : "";
      lines.push(`  ${pad(b.chain, 12)} ${balStr}${usd}`);
    }

    if (zeros.length > 0 && active.length > 0) lines.push("");
    if (zeros.length <= 6) {
      for (const b of zeros) {
        lines.push(`  ${pad(b.chain, 12)} 0`);
      }
    } else {
      lines.push(`  ${zeros.length} other chains at 0`);
    }
  }

  const icpTokens = data.icpTokens as Array<{ symbol: string; balance: string | number }> | undefined;
  if (icpTokens && icpTokens.length > 0) {
    lines.push("");
    lines.push("ICP TOKENS");
    lines.push("─".repeat(40));
    for (const t of icpTokens) {
      const bal = typeof t.balance === "number" ? t.balance : parseFloat(String(t.balance));
      const balStr = bal === 0 ? "0" : bal.toFixed(6).replace(/\.?0+$/, "");
      lines.push(`  ${pad(t.symbol, 12)} ${balStr}`);
    }
  }

  lines.push("─".repeat(40));
  const parts: string[] = [`${data.chainCount} chains`];
  if (data.failedCount) parts.push(`${data.failedCount} failed`);
  lines.push(parts.join(" | "));
  return lines.join("\n");
}

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}
