import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { jsonResult, requireWallet } from "./_helpers.js";
import { getChainBalance, getAllAddresses } from "../ic-client.js";
import { cacheFetch, CacheKeys, TTL } from "../cache.js";

export function createQuoteTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_quote",
    label: "Menese Quote",
    description:
      "Get token info, balances, and addresses for your wallet. " +
      "Use this before executing swaps to check your balances. Requires a wallet (run /setup first).",
    parameters: Type.Object({
      action: stringEnum(["balance", "addresses"] as const, {
        description: "'balance' to check a chain balance, 'addresses' to show all derived addresses",
      }),
      chain: Type.Optional(
        stringEnum([...SUPPORTED_CHAINS], {
          description: "Chain to check balance for (required for 'balance' action)",
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: {
        action: string;
        chain?: string;
      },
    ) {
      const wallet = requireWallet(store);
      if ("error" in wallet) return wallet.error;

      if (params.action === "addresses") {
        const res = await cacheFetch(
          CacheKeys.addresses(wallet.principal),
          TTL.ADDRESSES,
          () => getAllAddresses(config, wallet.principal),
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

      return jsonResult({ error: `Unknown action: ${params.action}` });
    },
  };
}
