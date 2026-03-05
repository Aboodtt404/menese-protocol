import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { jsonResult, requireAuthenticatedWallet } from "./_helpers.js";

export function createBridgeTool(_config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_bridge",
    label: "Menese Bridge",
    description:
      "Bridge tokens between blockchains. Currently queued for SDK integration. Requires a wallet (run /setup first).",
    parameters: Type.Object({
      fromChain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Source blockchain",
      }),
      toChain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Destination blockchain",
      }),
      token: Type.String({ description: "Token to bridge, e.g. 'USDC', 'ETH'" }),
      amount: Type.String({ description: "Amount to bridge (as a decimal string)" }),
      protocol: Type.Optional(Type.String({ description: "Bridge protocol (e.g. 'cctp', 'ultrafast'). Default: auto-select" })),
    }),
    async execute(
      _toolCallId: string,
      _params: {
        fromChain: string;
        toChain: string;
        token: string;
        amount: string;
        protocol?: string;
      },
    ) {
      const wallet = requireAuthenticatedWallet(store);
      if ("error" in wallet) return wallet.error;

      return jsonResult({
        error: "Bridge operations are not yet available via direct SDK calls. " +
          "Bridge methods (CCTP, Ultrafast) will be added in a future update.",
      });
    },
  };
}
