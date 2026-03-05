import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { sendToken } from "../ic-client.js";
import { writeToResult, requireAuthenticatedWallet, invalidateBalanceCaches } from "./_helpers.js";

export function createSendTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_send",
    label: "Menese Send",
    description:
      "Send native tokens to an address on any supported chain. Requires a wallet (run /setup first).",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain to send on",
      }),
      to: Type.String({ description: "Recipient address" }),
      amount: Type.String({ description: "Amount to send (as a decimal string)" }),
      token: Type.Optional(Type.String({ description: "Token symbol (default: native token)" })),
    }),
    async execute(
      _toolCallId: string,
      params: { chain: string; to: string; amount: string; token?: string },
    ) {
      const wallet = requireAuthenticatedWallet(store);
      if ("error" in wallet) return wallet.error;

      const res = await sendToken(config, wallet.seed, params.chain, params.to, params.amount, {
        token: params.token,
      });
      if (res.ok) invalidateBalanceCaches(wallet.principal);
      return writeToResult(res);
    },
  };
}
