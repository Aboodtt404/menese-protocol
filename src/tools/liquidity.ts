import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { jsonResult, requireAuthenticatedWallet } from "./_helpers.js";

const ACTIONS = ["add", "remove"] as const;

export function createLiquidityTool(_config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_liquidity",
    label: "Menese Liquidity",
    description:
      "Add or remove liquidity from DEX pools. Currently queued for SDK integration. Requires a wallet (run /setup first).",
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
        Type.String({ description: "Amount of tokenA (for 'add' action)" }),
      ),
      amountB: Type.Optional(
        Type.String({ description: "Amount of tokenB (for 'add' action)" }),
      ),
      lpAmount: Type.Optional(
        Type.String({ description: "LP token amount (for 'remove' action)" }),
      ),
    }),
    async execute(
      _toolCallId: string,
      _params: {
        chain: string;
        action: string;
        tokenA: string;
        tokenB: string;
        amountA?: string;
        amountB?: string;
        lpAmount?: string;
      },
    ) {
      const wallet = requireAuthenticatedWallet(store);
      if ("error" in wallet) return wallet.error;

      return jsonResult({
        error: "Liquidity operations are not yet available via direct SDK calls. " +
          "DEX liquidity methods will be added in a future update.",
      });
    },
  };
}
