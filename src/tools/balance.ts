import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { getChainBalance } from "../ic-client.js";
import { jsonResult } from "./_helpers.js";

export function createBalanceTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_balance",
    label: "Menese Balance",
    description:
      "Check the wallet balance for a specific blockchain. Returns the native token balance.",
    parameters: Type.Object({
      chain: stringEnum([...SUPPORTED_CHAINS], {
        description: "Blockchain to check balance on",
      }),
    }),
    async execute(_toolCallId: string, params: { chain: string }) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }

      const res = await getChainBalance(config, principal, params.chain);
      if (!res.ok) {
        return jsonResult({ error: res.error });
      }
      return jsonResult(res.data);
    },
  };
}
