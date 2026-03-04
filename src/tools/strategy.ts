import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { SUPPORTED_CHAINS } from "../chains.js";
import { callSdk, querySdk } from "../sdk-client.js";
import { jsonResult, sdkToResult, requireVerifiedWallet } from "./_helpers.js";

const ACTIONS = ["create", "list", "cancel", "status"] as const;
const RULE_TYPES = [
  "stop_loss",
  "take_profit",
  "dca",
  "rebalance",
  "volatility_trigger",
  "scheduled",
] as const;
const FREQUENCIES = ["hourly", "daily", "weekly", "monthly"] as const;
const DIRECTIONS = ["up", "down", "either"] as const;

export function createStrategyTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_strategy",
    label: "Menese Strategy",
    description:
      "Create and manage automated trading strategies. Supports stop-loss, take-profit, DCA, rebalance, volatility triggers, and scheduled operations. 'create' and 'cancel' require a verified wallet; 'list' and 'status' only need a linked wallet.",
    parameters: Type.Object({
      action: stringEnum([...ACTIONS], {
        description: "'create' a new rule, 'list' active rules, 'cancel' a rule, or check 'status' of a rule",
      }),
      ruleType: Type.Optional(
        stringEnum([...RULE_TYPES], {
          description: "Type of strategy rule (required for 'create')",
        }),
      ),
      ruleId: Type.Optional(Type.String({ description: "Rule ID (for 'cancel' or 'status')" })),
      // stop_loss / take_profit params
      token: Type.Optional(Type.String({ description: "Token symbol for the rule" })),
      chain: Type.Optional(
        stringEnum([...SUPPORTED_CHAINS], { description: "Chain for the rule" }),
      ),
      triggerPrice: Type.Optional(Type.String({ description: "Price that triggers the rule (USD)" })),
      sellPercentage: Type.Optional(
        Type.Number({ description: "Percentage of holdings to sell (1-100)", minimum: 1, maximum: 100 }),
      ),
      // DCA params
      amount: Type.Optional(Type.String({ description: "Amount per DCA purchase" })),
      frequency: Type.Optional(
        stringEnum([...FREQUENCIES], { description: "DCA frequency" }),
      ),
      sourceToken: Type.Optional(Type.String({ description: "Token to spend for DCA purchases" })),
      // Volatility trigger params
      changePercent: Type.Optional(
        Type.Number({ description: "Price change percentage that triggers the rule", minimum: 0.1 }),
      ),
      direction: Type.Optional(
        stringEnum([...DIRECTIONS], { description: "Price direction to watch" }),
      ),
      // Scheduled params
      cronExpression: Type.Optional(Type.String({ description: "Cron expression for scheduled rules" })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
    ) {
      const action = params.action as string;

      // Read-only actions: only need a linked wallet (no verification required)
      if (action === "list" || action === "status") {
        const principal = store.resolve("tool", "current");
        if (!principal) {
          return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
        }

        if (action === "list") {
          const res = await querySdk("strategy/rules", config, { principal });
          return sdkToResult(res);
        }

        // status
        if (!params.ruleId) {
          return jsonResult({ error: "ruleId is required for 'status' action." });
        }
        const res = await querySdk(
          `strategy/rules?ruleId=${encodeURIComponent(params.ruleId as string)}`,
          config,
          { principal },
        );
        return sdkToResult(res);
      }

      // Write actions (create, cancel): require verified wallet
      const wallet = requireVerifiedWallet(store);
      if ("error" in wallet) return wallet.error;
      const { principal } = wallet;

      if (action === "cancel") {
        if (!params.ruleId) {
          return jsonResult({ error: "ruleId is required for 'cancel' action." });
        }
        const res = await callSdk(
          "execute",
          { type: "strategy_cancel", ruleId: params.ruleId },
          config,
          { principal },
        );
        return sdkToResult(res);
      }

      // create
      if (!params.ruleType) {
        return jsonResult({ error: "ruleType is required when creating a strategy." });
      }

      const res = await callSdk(
        "execute",
        {
          type: "strategy_create",
          ruleType: params.ruleType,
          token: params.token,
          chain: params.chain,
          triggerPrice: params.triggerPrice,
          sellPercentage: params.sellPercentage,
          amount: params.amount,
          frequency: params.frequency,
          sourceToken: params.sourceToken,
          changePercent: params.changePercent,
          direction: params.direction,
          cronExpression: params.cronExpression,
        },
        config,
        { principal },
      );

      return sdkToResult(res);
    },
  };
}
