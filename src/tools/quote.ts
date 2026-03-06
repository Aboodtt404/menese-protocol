import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { jsonResult, requireWallet, requireAuthenticatedWallet } from "./_helpers.js";
import { getChainBalance, getAllAddresses, getSwapQuote } from "../ic-client.js";
import { cacheFetch, CacheKeys, TTL } from "../cache.js";

export function createQuoteTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_quote",
    label: "Menese Quote",
    description:
      "Get swap quotes, balances, and addresses for your wallet. " +
      "Use 'quote' to get a swap price estimate before executing. Requires a wallet (run /setup first).\n\n" +
      "IMPORTANT: Display results exactly as returned inside a code block. Do NOT reformat or add emojis.",
    parameters: Type.Object({
      action: stringEnum(["balance", "addresses", "quote"] as const, {
        description: "'balance' to check a chain balance, 'addresses' to show all derived addresses, 'quote' to get a swap price estimate",
      }),
      chain: Type.Optional(
        stringEnum([...SUPPORTED_CHAINS], {
          description: "Chain (required for 'balance' and 'quote' actions)",
        }),
      ),
      fromToken: Type.Optional(Type.String({ description: "Token to swap from (required for 'quote')" })),
      toToken: Type.Optional(Type.String({ description: "Token to swap to (required for 'quote')" })),
      amount: Type.Optional(Type.String({ description: "Amount to quote (required for 'quote')" })),
    }),
    async execute(
      _toolCallId: string,
      params: {
        action: string;
        chain?: string;
        fromToken?: string;
        toToken?: string;
        amount?: string;
      },
    ) {
      const wallet = requireWallet(store);
      if ("error" in wallet) return wallet.error;

      if (params.action === "addresses") {
        const seed = store.getSeed("tool", "current");
        const res = await cacheFetch(
          CacheKeys.addresses(wallet.principal),
          TTL.ADDRESSES,
          () => getAllAddresses(config, wallet.principal, seed ?? undefined),
        );
        if (!res.ok) return jsonResult({ error: res.error });
        return jsonResult(res.data);
      }

      if (params.action === "balance") {
        if (!params.chain) return jsonResult({ error: "Missing required parameter: chain" });
        const res = await cacheFetch(
          CacheKeys.balance(wallet.principal, params.chain),
          TTL.BALANCE,
          () => getChainBalance(config, wallet.principal, params.chain!),
        );
        if (!res.ok) return jsonResult({ error: res.error });
        return jsonResult(res.data);
      }

      if (params.action === "quote") {
        if (!params.chain || !params.fromToken || !params.toToken || !params.amount) {
          return jsonResult({ error: "Missing required parameters: chain, fromToken, toToken, amount" });
        }
        const auth = requireAuthenticatedWallet(store);
        if ("error" in auth) return auth.error;
        const res = await getSwapQuote(config, auth.seed, {
          chain: params.chain,
          fromToken: params.fromToken,
          toToken: params.toToken,
          amount: params.amount,
        });
        if (!res.ok) return jsonResult({ error: res.error });
        return jsonResult(res.data);
      }

      return jsonResult({ error: `Unknown action: ${params.action}` });
    },
  };
}
