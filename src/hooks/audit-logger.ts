import * as fs from "node:fs";
import * as path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import { classifySdkError } from "../errors.js";

/**
 * Audit logger — writes a JSONL log entry for every menese_* tool call.
 * Append-only to `{stateDir}/plugins/menese-protocol/audit.jsonl`.
 */

interface AuditEntry {
  timestamp: string;
  toolName: string;
  params: Record<string, unknown>;
  durationMs?: number;
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    userMessage: string;
  };
}

export function registerAuditLogger(api: OpenClawPluginApi, config: MeneseConfig): void {
  const stateDir = api.runtime.state.resolveStateDir();
  const dir = path.join(stateDir, "plugins", "menese-protocol");
  const logPath = path.join(dir, "audit.jsonl");

  function appendEntry(entry: AuditEntry): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      // Audit logging should never break the tool flow
    }
  }

  api.on("after_tool_call", (event) => {
    // Only log menese tools
    if (!event.toolName.startsWith("menese_")) return;

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      toolName: event.toolName,
      params: event.params,
      durationMs: event.durationMs,
      success: !event.error,
    };

    if (event.error) {
      const classified = classifySdkError(event.error);
      entry.error = {
        code: classified.code,
        message: classified.message,
        userMessage: classified.userMessage,
      };
    } else if (event.result !== undefined) {
      entry.result = event.result;
    }

    appendEntry(entry);
  });
}
