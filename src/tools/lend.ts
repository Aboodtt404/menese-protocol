import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const MODES = ["quote", "execute"] as const;
const ACTIONS = ["supply", "withdraw", "borrow", "repay"] as const;
const PROTOCOLS = ["aave_v3"] as const;

export function createLendTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_lend",
    label: "Menese Lend",
    description:
      "Supply, withdraw, borrow, or repay tokens on lending protocols. Use mode 'quote' first to show current APY and health factor impact, then 'execute' after confirmation. Currently supports Aave V3.",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain where the lending protocol operates",
      }),
      action: stringEnum([...ACTIONS], {
        description: "'supply' to deposit and earn yield, 'withdraw' to retrieve, 'borrow' to take a loan, 'repay' to pay back",
      }),
      protocol: stringEnum([...PROTOCOLS], {
        description: "Lending protocol to use",
      }),
      asset: Type.String({ description: "Asset to supply/withdraw/borrow/repay, e.g. 'ETH', 'USDC'" }),
      amount: Type.String({ description: "Amount (as a decimal string)" }),
      mode: stringEnum([...MODES], {
        description: "Use 'quote' to preview APY and health factor, 'execute' after user confirms",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        action: string;
        protocol: string;
        asset: string;
        amount: string;
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
          type: "lend",
          mode: params.mode,
          chain: params.chain,
          protocol: params.protocol,
          amount: params.amount,
          asset: params.asset,
          action: params.action,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
