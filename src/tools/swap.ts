import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const MODES = ["quote", "execute"] as const;

export function createSwapTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_swap",
    label: "Menese Swap",
    description:
      "Swap tokens on a given chain. Use mode 'quote' first to show the user expected output and fees, then 'execute' after confirmation. Supports multi-hop routes automatically.",
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
      dex: Type.Optional(Type.String({ description: "DEX to use (default: auto-select best route)" })),
      mode: stringEnum([...MODES], {
        description: "Use 'quote' to preview output, 'execute' to swap after user confirms",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        fromToken: string;
        toToken: string;
        amount: string;
        slippageBps?: number;
        dex?: string;
        mode: string;
      },
    ) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }

      const res = await callSdk(
        "execute",
        {
          type: "swap",
          mode: params.mode,
          chain: params.chain,
          fromToken: params.fromToken,
          toToken: params.toToken,
          amount: params.amount,
          slippageBps: String(params.slippageBps ?? 250),
          dex: params.dex,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
