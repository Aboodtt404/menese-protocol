import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { stakeOrLend } from "../ic-client.js";
import { writeToResult, requireAuthenticatedWallet, invalidateBalanceCaches } from "./_helpers.js";

const ACTIONS = ["supply", "withdraw"] as const;

export function createLendTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_lend",
    label: "Menese Lend",
    description:
      "Supply or withdraw tokens on Aave V3. Supports ETH and ERC-20 tokens on EVM chains. Requires a wallet (run /setup first).",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain where Aave V3 operates",
      }),
      action: stringEnum([...ACTIONS], {
        description: "'supply' to deposit and earn yield, 'withdraw' to retrieve",
      }),
      asset: Type.String({ description: "Asset to supply/withdraw, e.g. 'ETH', 'USDC'" }),
      amount: Type.String({ description: "Amount (as a decimal string)" }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        action: string;
        asset: string;
        amount: string;
      },
    ) {
      const wallet = requireAuthenticatedWallet(store);
      if ("error" in wallet) return wallet.error;

      const res = await stakeOrLend(config, wallet.seed, {
        action: params.action,
        protocol: "aave",
        chain: params.chain,
        asset: params.asset,
        amount: params.amount,
      });
      if (res.ok) invalidateBalanceCaches(wallet.principal);
      return writeToResult(res);
    },
  };
}
