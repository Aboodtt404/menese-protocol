import * as fs from "node:fs";
import * as path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { readJsonBodyWithLimit } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";

/**
 * Webhook route — receives async callbacks from the SDK relay.
 *
 * POST /plugins/menese/callback
 *
 * Events: bridge completions, strategy triggers, job status updates.
 * Auth: X-Api-Key must match config.developerKey (when set).
 */

interface WebhookEvent {
  event: string;
  jobId?: string;
  ruleId?: string;
  status?: string;
  result?: unknown;
  chain?: string;
  amount?: string;
  token?: string;
  timestamp?: string;
}

export function registerMeneseWebhook(api: OpenClawPluginApi, config: MeneseConfig): void {
  const stateDir = api.runtime.state.resolveStateDir();
  const notifDir = path.join(stateDir, "plugins", "menese-protocol");
  const notifPath = path.join(notifDir, "notifications.jsonl");

  function appendNotification(event: WebhookEvent): void {
    try {
      fs.mkdirSync(notifDir, { recursive: true });
      const entry = { ...event, receivedAt: new Date().toISOString() };
      fs.appendFileSync(notifPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      // Notification logging should never break the webhook response
    }
  }

  api.registerHttpRoute({
    path: "/plugins/menese/callback",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      // Only accept POST
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      // Auth check: if developerKey is configured, require it
      if (config.developerKey) {
        const apiKey =
          req.headers["x-api-key"] as string | undefined ??
          (req.headers["authorization"]?.replace(/^Bearer\s+/i, "") ?? "");
        if (apiKey !== config.developerKey) {
          res.statusCode = 401;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
      }

      // Parse body
      const body = await readJsonBodyWithLimit(req, {
        maxBytes: 64 * 1024,
        timeoutMs: 10_000,
      });

      if (!body.ok) {
        const status =
          body.code === "PAYLOAD_TOO_LARGE" ? 413 :
          body.code === "REQUEST_BODY_TIMEOUT" ? 408 : 400;
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: body.error }));
        return;
      }

      const event = body.value as WebhookEvent;

      if (!event || typeof event !== "object" || !event.event) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing 'event' field" }));
        return;
      }

      // Log and persist the notification
      api.logger.info?.(`[menese] Webhook received: ${event.event} (job=${event.jobId ?? "—"})`);
      appendNotification(event);

      // Success
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    },
  });
}
