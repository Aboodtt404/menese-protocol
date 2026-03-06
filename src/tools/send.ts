import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { sendToken } from "../ic-client.js";
import { writeToResult, cardResult, requireAuthenticatedWallet, invalidateBalanceCaches } from "./_helpers.js";

export function createSendTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_send",
    label: "Menese Send",
    description:
      "Send native or fungible tokens on any supported chain. Requires a wallet (run /setup first).\n\n" +
      "For tokens: on ICP pass token='ckUSDC' (or any ICRC-1 symbol/canister ID), " +
      "on Solana pass token='USDC' or a mint address, " +
      "on Tron pass token='USDT' or a TRC-20 contract address, " +
      "on XRP pass token='CURRENCY:ISSUER' for IOU tokens. " +
      "Omit token for native sends (ETH, SOL, ICP, BTC, etc.).\n\n" +
      "IMPORTANT: The result is already formatted. Display it exactly as returned inside a code block. Do NOT reformat or add emojis.",
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
      if (res.ok) {
        invalidateBalanceCaches(wallet.principal);
        const tokenLabel = params.token ?? params.chain.toUpperCase();
        let txId: string | undefined;
        if (res.data && typeof res.data === "object") {
          const d = res.data as Record<string, unknown>;
          txId = (d.txid ?? d.txHash ?? d.txSignature) as string | undefined;
        }
        return cardResult(formatSend(params.chain, tokenLabel, params.amount, params.to, txId), res.data);
      }
      return writeToResult(res);
    },
  };
}

function formatSend(chain: string, token: string, amount: string, to: string, txId?: string): string {
  const lines: string[] = ["SEND CONFIRMATION"];
  lines.push("─".repeat(40));
  lines.push(`  Chain        ${chain}`);
  lines.push(`  Token        ${token}`);
  lines.push(`  Amount       ${amount}`);
  lines.push(`  To           ${to}`);
  if (txId) {
    lines.push(`  TX           ${txId}`);
  }
  lines.push("─".repeat(40));
  lines.push(txId ? "Sent successfully." : "Submitted.");
  return lines.join("\n");
}
