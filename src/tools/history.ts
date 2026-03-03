import { Type } from "@sinclair/typebox";
import { optionalStringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { querySdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const OPERATION_TYPES = ["send", "swap", "bridge", "stake", "lend", "strategy"] as const;

export function createHistoryTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_history",
    label: "Menese History",
    description:
      "View recent transaction history. Shows operations with timestamps, amounts, status, and transaction hashes.",
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Number({ description: "Number of recent operations to return (default: 10)", minimum: 1, maximum: 50 }),
      ),
      type: optionalStringEnum([...OPERATION_TYPES], {
        description: "Filter by operation type",
      }),
    }),
    async execute(
      _toolCallId: string,
      params: { limit?: number; type?: string },
    ) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }

      const limit = params.limit ?? 10;
      let path = `logs?limit=${limit}`;
      if (params.type) {
        path += `&type=${encodeURIComponent(params.type)}`;
      }

      const res = await querySdk(path, config, { principal });
      return sdkToResult(res);
    },
  };
}
