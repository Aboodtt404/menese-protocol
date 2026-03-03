import { DEFAULT_SDK_CANISTER_ID, SDK_TEST_STAGING_CANISTER_ID } from "./canisters.js";

export const TEST_SDK_CANISTER_ID = SDK_TEST_STAGING_CANISTER_ID;
export const DEFAULT_RELAY_URL = "http://localhost:18791";

export interface MeneseConfig {
  sdkCanisterId: string;
  relayUrl: string;
  autoApproveThreshold: number;
  developerKey?: string;
  testMode: boolean;
}

export function parseMeneseConfig(value: unknown): MeneseConfig {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const testMode = typeof raw.testMode === "boolean" ? raw.testMode : false;

  const sdkCanisterId =
    typeof raw.sdkCanisterId === "string" && raw.sdkCanisterId.trim()
      ? raw.sdkCanisterId.trim()
      : testMode
        ? TEST_SDK_CANISTER_ID
        : DEFAULT_SDK_CANISTER_ID;

  const relayUrl =
    typeof raw.relayUrl === "string" && raw.relayUrl.trim()
      ? raw.relayUrl.trim()
      : (process.env.MENESE_RELAY_URL ?? DEFAULT_RELAY_URL);

  const autoApproveThreshold =
    typeof raw.autoApproveThreshold === "number" && raw.autoApproveThreshold >= 0
      ? raw.autoApproveThreshold
      : 0;

  const developerKey =
    typeof raw.developerKey === "string" && raw.developerKey.trim()
      ? raw.developerKey.trim()
      : (process.env.MENESE_DEVELOPER_KEY ?? undefined);

  return {
    sdkCanisterId,
    relayUrl,
    autoApproveThreshold,
    developerKey,
    testMode,
  };
}
