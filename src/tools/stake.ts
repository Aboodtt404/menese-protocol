import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const MODES = ["quote", "execute"] as const;
const ACTIONS = ["stake", "unstake", "wrap", "unwrap"] as const;

export function createStakeTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_stake",
    label: "Menese Stake",
    description:
      "Stake, unstake, wrap, or unwrap tokens. Use mode 'quote' first to show current APY and estimated rewards, then 'execute' after confirmation. Supports Lido (ETH staking) and other protocols.",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain to stake on",
      }),
      action: stringEnum([...ACTIONS], {
        description: "'stake' to deposit, 'unstake' to withdraw, 'wrap'/'unwrap' for wrapped staking derivatives (e.g. wstETH)",
      }),
      protocol: Type.String({ description: "Staking protocol, e.g. 'lido', 'aave'" }),
      amount: Type.String({ description: "Amount to stake/unstake (as a decimal string)" }),
      mode: stringEnum([...MODES], {
        description: "Use 'quote' to preview APY and rewards, 'execute' to stake after user confirms",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        action: string;
        protocol: string;
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
          type: "stake",
          mode: params.mode,
          chain: params.chain,
          protocol: params.protocol,
          amount: params.amount,
          action: params.action,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
