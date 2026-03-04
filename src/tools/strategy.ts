import { Type } from "@sinclair/typebox";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { jsonResult } from "./_helpers.js";

export function createStrategyTool(_config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_strategy",
    label: "Menese Strategy",
    description:
      "Create and manage automated trading strategies. Currently not available — requires a MeneseAgent canister.",
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: Record<string, never>) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }
      return jsonResult({
        message: "Strategy management is not yet available. " +
          "This feature requires a MeneseAgent canister instance.",
      });
    },
  };
}
