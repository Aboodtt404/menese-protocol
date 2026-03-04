import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult, requireVerifiedWallet } from "./_helpers.js";

const MODES = ["quote", "execute"] as const;

export function createBridgeTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_bridge",
    label: "Menese Bridge",
    description:
      "Bridge tokens between blockchains. Use mode 'quote' first to show fees and estimated time, then 'execute' after confirmation. Automatically selects the best route (CCTP, Ultrafast, etc.). Requires a verified wallet.",
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
      const wallet = requireVerifiedWallet(store);
      if ("error" in wallet) return wallet.error;
      const { principal } = wallet;

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
