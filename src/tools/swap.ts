import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { swapTokensOnChain } from "../ic-client.js";
import { writeToResult, requireAuthenticatedWallet, invalidateBalanceCaches } from "./_helpers.js";

export function createSwapTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_swap",
    label: "Menese Swap",
    description:
      "Swap tokens on a given chain. Supports EVM chains with auto-routing. Requires a wallet (run /setup first).",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain to swap on",
      }),
      fromToken: Type.String({ description: "Token to sell, e.g. 'ETH', 'USDC'" }),
      toToken: Type.String({ description: "Token to buy" }),
      amount: Type.String({ description: "Amount of fromToken to swap (as a decimal string)" }),
      slippageBps: Type.Optional(
        Type.Number({ description: "Max slippage in basis points (100 = 1%, default: 250 = 2.5%)", minimum: 1, maximum: 5000 }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        fromToken: string;
        toToken: string;
        amount: string;
        slippageBps?: number;
      },
    ) {
      const wallet = requireAuthenticatedWallet(store);
      if ("error" in wallet) return wallet.error;

      const res = await swapTokensOnChain(config, wallet.seed, {
        chain: params.chain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
        slippageBps: params.slippageBps,
      });
      if (res.ok) invalidateBalanceCaches(wallet.principal);
      return writeToResult(res);
    },
  };
}
