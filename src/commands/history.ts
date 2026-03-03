import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { querySdk } from "../sdk-client.js";

/**
 * /history [count?] — Recent operation history.
 *
 * Fetches the last N operations from the SDK relay log endpoint.
 */
export function registerHistoryCommand(
  api: OpenClawPluginApi,
  config: MeneseConfig,
  store: IdentityStore,
): void {
  api.registerCommand({
    name: "history",
    description: "Show your recent transaction history",
    acceptsArgs: true,
    handler: async (ctx) => {
      const principal = store.resolve(ctx.channel, ctx.senderId ?? "unknown");
      if (!principal) {
        return {
          text: "No wallet linked. Run `/setup` to connect your wallet first.",
          isError: true,
        };
      }

      const countArg = ctx.args?.trim();
      let limit = 10;
      if (countArg) {
        const parsed = parseInt(countArg, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 50) {
          return {
            text: "Invalid count. Use a number between 1 and 50.\nExample: `/history 20`",
            isError: true,
          };
        }
        limit = parsed;
      }

      const res = await querySdk<Record<string, unknown>>(
        `logs?limit=${limit}`,
        config,
        { principal },
      );

      if (!res.ok) {
        return {
          text: `Failed to fetch history: ${res.error.userMessage}`,
          isError: true,
        };
      }

      const data = res.data;
      const logs = (Array.isArray(data.logs) ? data.logs : Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;

      if (logs.length === 0) {
        return { text: "No transaction history found." };
      }

      const lines: string[] = [`**Recent Transactions** (last ${logs.length})\n`];

      for (const log of logs) {
        const op = log.operation ?? log.type ?? "unknown";
        const ts = log.timestamp ? new Date(Number(log.timestamp)).toLocaleString() : "";
        const status = log.result === "ok" || log.success ? "ok" : "err";
        const hash = typeof log.txHash === "string" ? log.txHash.slice(0, 12) + "..." : "";

        const parts: string[] = [`\`${status}\` **${op}**`];
        if (log.amount) parts.push(String(log.amount));
        if (log.chain) parts.push(`on ${log.chain}`);
        if (hash) parts.push(`tx:${hash}`);
        if (ts) parts.push(`— ${ts}`);

        lines.push(`- ${parts.join(" ")}`);
      }

      return { text: lines.join("\n") };
    },
  });
}
