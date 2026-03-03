import { Type } from "@sinclair/typebox";
import { stringEnum } from "openclaw/plugin-sdk";
import type { MeneseConfig } from "../config.js";
import type { IdentityStore } from "../store.js";
import { querySdk, callSdk } from "../sdk-client.js";
import { jsonResult, sdkToResult } from "./_helpers.js";

const ACTIONS = ["list", "status", "cancel"] as const;

export function createJobsTool(config: MeneseConfig, store: IdentityStore) {
  return {
    name: "menese_jobs",
    label: "Menese Jobs",
    description:
      "View and manage active jobs and pending operations — scheduled tasks, bridge transfers in progress, strategy executions. Use 'list' to see all, 'status' to check a specific job, or 'cancel' to stop one.",
    parameters: Type.Object({
      action: stringEnum([...ACTIONS], {
        description: "'list' all active jobs, 'status' of a specific job, or 'cancel' a job",
      }),
      jobId: Type.Optional(Type.String({ description: "Job ID (required for 'status' and 'cancel')" })),
    }),
    async execute(
      _toolCallId: string,
      params: { action: string; jobId?: string },
    ) {
      const principal = store.resolve("tool", "current");
      if (!principal) {
        return jsonResult({ error: "No wallet linked. Use /setup to connect your wallet." });
      }

      if (params.action === "list") {
        const res = await querySdk("jobs", config, { principal });
        return sdkToResult(res);
      }

      if (!params.jobId) {
        return jsonResult({ error: "jobId is required for 'status' and 'cancel' actions." });
      }

      if (params.action === "status") {
        const res = await querySdk(
          `jobs?jobId=${encodeURIComponent(params.jobId)}`,
          config,
          { principal },
        );
        return sdkToResult(res);
      }

      // cancel
      const res = await callSdk(
        "jobs",
        { action: "cancel", jobId: params.jobId },
        config,
        { principal },
      );
      return sdkToResult(res);
    },
  };
}
