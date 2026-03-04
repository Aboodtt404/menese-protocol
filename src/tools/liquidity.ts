import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult, requireVerifiedWallet } from "./_helpers.js";

const MODES = ["quote", "execute"] as const;
const ACTIONS = ["add", "remove"] as const;

export function createLiquidityTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_liquidity",
    label: "Menese Liquidity",
    description:
      "Add or remove liquidity from DEX pools. Use mode 'quote' first to show pool info, share percentage, and impermanent loss warning, then 'execute' after confirmation. Supports EVM DEXes and ICP pools. Requires a verified wallet.",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain where the pool exists",
      }),
      action: stringEnum([...ACTIONS], {
        description: "'add' to provide liquidity, 'remove' to withdraw",
      }),
      tokenA: Type.String({ description: "First token in the pair, e.g. 'ETH'" }),
      tokenB: Type.String({ description: "Second token in the pair, e.g. 'USDC'" }),
      amountA: Type.Optional(
        Type.String({ description: "Amount of tokenA to add (for 'add' action)" }),
      ),
      amountB: Type.Optional(
        Type.String({ description: "Amount of tokenB to add (for 'add' action)" }),
      ),
      lpAmount: Type.Optional(
        Type.String({ description: "LP token amount to remove (for 'remove' action)" }),
      ),
      mode: stringEnum([...MODES], {
        description: "Use 'quote' to preview pool impact, 'execute' after user confirms",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: {
        chain: string;
        action: string;
        tokenA: string;
        tokenB: string;
        amountA?: string;
        amountB?: string;
        lpAmount?: string;
        mode: string;
      },
    ) {
      const wallet = requireVerifiedWallet(store);
      if ("error" in wallet) return wallet.error;
      const { principal } = wallet;

      const res = await callSdk(
        "execute",
        {
          type: "liquidity",
          mode: params.mode,
          chain: params.chain,
          action: params.action,
          tokenA: params.tokenA,
          tokenB: params.tokenB,
          amountA: params.amountA,
          amountB: params.amountB,
          lpAmount: params.lpAmount,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
