import { classifySdkError, type ClassifiedError } from "./errors.js";
import type { MeneseConfig } from "./config.js";

/**
 * SDK relay client — sends HTTP requests to the VPS relay which forwards
 * them to the MeneseAgent canister on the Internet Computer.
 */

export interface SdkResult<T = unknown> {
  ok: true;
  data: T;
}

export interface SdkError {
  ok: false;
  error: ClassifiedError;
}

export type SdkResponse<T = unknown> = SdkResult<T> | SdkError;

// ── Rate Limit Tracking ──────────────────────────────────────────────

const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_SDK_CALLS_PER_HOUR = 200;

const requestTimestamps: number[] = [];
const sdkCallTimestamps: number[] = [];

function pruneTimestamps(): void {
  const now = Date.now();
  const oneMinAgo = now - 60_000;
  const oneHourAgo = now - 3_600_000;

  while (requestTimestamps.length > 0 && requestTimestamps[0]! < oneMinAgo) {
    requestTimestamps.shift();
  }
  while (sdkCallTimestamps.length > 0 && sdkCallTimestamps[0]! < oneHourAgo) {
    sdkCallTimestamps.shift();
  }
}

export function getRateLimitStatus(): {
  requestsPerMinute: number;
  sdkCallsPerHour: number;
  requestsRemaining: number;
  sdkCallsRemaining: number;
  nearLimit: boolean;
} {
  pruneTimestamps();
  const rpm = requestTimestamps.length;
  const cph = sdkCallTimestamps.length;
  return {
    requestsPerMinute: rpm,
    sdkCallsPerHour: cph,
    requestsRemaining: Math.max(0, MAX_REQUESTS_PER_MINUTE - rpm),
    sdkCallsRemaining: Math.max(0, MAX_SDK_CALLS_PER_HOUR - cph),
    nearLimit: rpm >= 50 || cph >= 180,
  };
}

// ── SDK Call ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

export async function callSdk<T = unknown>(
  method: string,
  params: Record<string, unknown>,
  config: MeneseConfig,
  options?: { principal?: string; timeoutMs?: number },
): Promise<SdkResponse<T>> {
  pruneTimestamps();

  // Pre-check rate limits
  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Client-side rate limit: 60 requests/minute exceeded",
        retryable: true,
        userMessage: "Rate limit reached. Wait a moment before trying again.",
      },
    };
  }
  if (sdkCallTimestamps.length >= MAX_SDK_CALLS_PER_HOUR) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Client-side rate limit: 200 SDK calls/hour exceeded",
        retryable: true,
        userMessage: "Hourly SDK call limit reached. Please wait before making more transactions.",
      },
    };
  }

  const url = `${config.relayUrl}/api/v1/${method}`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Canister-Id": config.sdkCanisterId,
  };
  if (config.developerKey) {
    headers["X-Api-Key"] = config.developerKey;
  }
  if (options?.principal) {
    headers["X-Principal"] = options.principal;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    requestTimestamps.push(Date.now());
    sdkCallTimestamps.push(Date.now());

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch {
      return { ok: false, error: classifySdkError(`HTTP ${response.status}: non-JSON response from relay`) };
    }

    if (!response.ok) {
      const errorMsg =
        typeof body.error === "string"
          ? body.error
          : `HTTP ${response.status}: ${response.statusText}`;
      return { ok: false, error: classifySdkError(errorMsg) };
    }

    return { ok: true, data: body as T };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        error: classifySdkError("Timeout expired waiting for SDK relay response"),
      };
    }
    return { ok: false, error: classifySdkError(err) };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Address Cache ────────────────────────────────────────────────────
// Addresses are deterministic per principal and never change, so we
// cache them permanently in memory to avoid repeated relay round-trips.

const addressCache = new Map<string, Record<string, unknown>>();

/**
 * Get the EVM address for a principal (cached).
 * Uses POST /api/v1/execute with type "getMyEvmAddress" since the relay
 * doesn't expose GET /api/v1/addresses.
 * First call hits the relay; subsequent calls return instantly from memory.
 */
export async function queryAddresses(
  config: MeneseConfig,
  principal: string,
): Promise<SdkResponse<Record<string, unknown>>> {
  const cached = addressCache.get(principal);
  if (cached) {
    return { ok: true, data: cached };
  }

  // Try GET /api/v1/addresses first, fall back to POST execute
  const getRes = await querySdk<Record<string, unknown>>("addresses", config, { principal });
  if (getRes.ok) {
    addressCache.set(principal, getRes.data);
    return getRes;
  }

  // Fallback: use the execute endpoint to call getMyEvmAddress
  const postRes = await callSdk<Record<string, unknown>>(
    "execute",
    { type: "getMyEvmAddress" },
    config,
    { principal },
  );
  if (postRes.ok) {
    // Wrap in the expected { evm: { evmAddress } } shape
    const data = postRes.data;
    const normalized = data.evmAddress
      ? { evm: { evmAddress: data.evmAddress } }
      : data;
    addressCache.set(principal, normalized as Record<string, unknown>);
    return { ok: true, data: normalized as Record<string, unknown> };
  }
  return postRes;
}

/**
 * Convenience: call a GET endpoint on the relay (balances, addresses, logs, etc.)
 */
export async function querySdk<T = unknown>(
  path: string,
  config: MeneseConfig,
  options?: { principal?: string; timeoutMs?: number },
): Promise<SdkResponse<T>> {
  pruneTimestamps();

  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Client-side rate limit: 60 requests/minute exceeded",
        retryable: true,
        userMessage: "Rate limit reached. Wait a moment before trying again.",
      },
    };
  }

  const url = `${config.relayUrl}/api/v1/${path}`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = {
    "X-Canister-Id": config.sdkCanisterId,
  };
  if (config.developerKey) {
    headers["X-Api-Key"] = config.developerKey;
  }
  if (options?.principal) {
    headers["X-Principal"] = options.principal;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    requestTimestamps.push(Date.now());

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    let body: Record<string, unknown>;
    try {
      body = await response.json() as Record<string, unknown>;
    } catch {
      return { ok: false, error: classifySdkError(`HTTP ${response.status}: non-JSON response from relay`) };
    }

    if (!response.ok) {
      const errorMsg =
        typeof body.error === "string"
          ? body.error
          : `HTTP ${response.status}: ${response.statusText}`;
      return { ok: false, error: classifySdkError(errorMsg) };
    }

    return { ok: true, data: body as T };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        error: classifySdkError("Timeout expired waiting for SDK relay response"),
      };
    }
    return { ok: false, error: classifySdkError(err) };
  } finally {
    clearTimeout(timeout);
  }
}
