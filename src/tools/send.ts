import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const MODES = ["quote", "execute"] as const;

export function createSendTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_send",
    label: "Menese Send",
    description:
      "Send tokens to an address. Use mode 'quote' first to show the user estimated gas fees, then 'execute' after confirmation.",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain to send on",
      }),
      to: Type.String({ description: "Recipient address" }),
      amount: Type.String({ description: "Amount to send (as a decimal string)" }),
      token: Type.Optional(Type.String({ description: "Token symbol (default: native token)" })),
      memo: Type.Optional(Type.String({ description: "Optional memo (used by some chains like Thorchain)" })),
      mode: stringEnum([...MODES], {
        description: "Use 'quote' to preview fees, 'execute' to send after user confirms",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        to: string;
        amount: string;
        token?: string;
        memo?: string;
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
          type: "send",
          mode: params.mode,
          chain: params.chain,
          to: params.to,
          amount: params.amount,
          token: params.token,
          memo: params.memo,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
