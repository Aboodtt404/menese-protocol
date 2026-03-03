import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const QUOTE_ACTIONS = ["swap", "bridge"] as const;

export function createQuoteTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_quote",
    label: "Menese Quote",
    description:
      "Get a price quote for a swap or bridge without executing. Returns expected output, fees, price impact, and route. Free to call — no funds are moved.",
    parameters: Type.Object({
      action: stringEnum([...QUOTE_ACTIONS], {
        description: "Type of operation to quote",
      }),
      fromToken: Type.String({ description: "Source token symbol, e.g. 'ETH', 'USDC'" }),
      toToken: Type.String({ description: "Destination token symbol" }),
      amount: Type.String({ description: "Amount of fromToken to quote (as a decimal string)" }),
      chain: Type.Optional(
        stringEnum([...SUPPORTED_CHAINS], {
          description: "Chain for swap quotes",
        }),
      ),
      fromChain: Type.Optional(
        stringEnum([...SUPPORTED_CHAINS], {
          description: "Source chain for bridge quotes",
        }),
      ),
      toChain: Type.Optional(
        stringEnum([...SUPPORTED_CHAINS], {
          description: "Destination chain for bridge quotes",
        }),
      ),
    }),
    async execute(
      _toolCallId: string,
      params: {
        action: string;
        fromToken: string;
        toToken: string;
        amount: string;
        chain?: string;
        fromChain?: string;
        toChain?: string;
      },
    ) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }

      const res = await callSdk(
        "execute",
        {
          type: params.action,
          mode: "quote",
          fromToken: params.fromToken,
          toToken: params.toToken,
          amount: params.amount,
          chain: params.chain,
          fromChain: params.fromChain,
          toChain: params.toChain,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
