import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const MODES = ["quote", "execute"] as const;

export function createBridgeTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_bridge",
    label: "Menese Bridge",
    description:
      "Bridge tokens between blockchains. Use mode 'quote' first to show fees and estimated time, then 'execute' after confirmation. Automatically selects the best route (CCTP, Ultrafast, etc.).",
    parameters: Type.Object({
      fromChain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Source blockchain",
      }),
      toChain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Destination blockchain",
      }),
      token: Type.String({ description: "Token to bridge, e.g. 'USDC', 'ETH'" }),
      amount: Type.String({ description: "Amount to bridge (as a decimal string)" }),
      protocol: Type.Optional(Type.String({ description: "Bridge protocol (e.g. 'cctp', 'ultrafast'). Default: auto-select best route" })),
      mode: stringEnum([...MODES], {
        description: "Use 'quote' to preview fees and time, 'execute' to bridge after user confirms",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        fromChain: string;
        toChain: string;
        token: string;
        amount: string;
        protocol?: string;
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
          type: "bridge",
          mode: params.mode,
          fromChain: params.fromChain,
          toChain: params.toChain,
          token: params.token,
          amount: params.amount,
          protocol: params.protocol,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
