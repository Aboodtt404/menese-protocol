import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { stakeOrLend } from "../ic-client.js";
import { writeToResult, requireAuthenticatedWallet, invalidateBalanceCaches } from "./_helpers.js";

const ACTIONS = ["stake", "unstake"] as const;

export function createStakeTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_stake",
    label: "Menese Stake",
    description:
      "Stake or unstake tokens. Supports Lido (ETH→stETH) on EVM chains. Requires a wallet (run /setup first).",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain to stake on",
      }),
      action: stringEnum([...ACTIONS], {
        description: "'stake' to deposit, 'unstake' to withdraw",
      }),
      protocol: Type.String({ description: "Staking protocol, e.g. 'lido'" }),
      amount: Type.String({ description: "Amount to stake/unstake (as a decimal string)" }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        action: string;
        protocol: string;
        amount: string;
      },
    ) {
      const wallet = requireAuthenticatedWallet(store);
      if ("error" in wallet) return wallet.error;

      const res = await stakeOrLend(config, wallet.seed, {
        action: params.action,
        protocol: params.protocol,
        chain: params.chain,
        amount: params.amount,
      });
      if (res.ok) invalidateBalanceCaches(wallet.principal);
      return writeToResult(res);
    },
  };
}
