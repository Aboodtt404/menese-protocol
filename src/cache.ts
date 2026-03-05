/**
 * Simple in-memory TTL cache for read operations.
 *
 * - Prices: 60s (CoinGecko rate limits + prices don't change per-second)
 * - Balances: 30s (reasonable staleness for portfolio views)
 * - Addresses: Infinity (derived addresses never change)
 *
 * Write operations (send, swap, stake, lend) invalidate relevant cache entries.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Get a cached value, or undefined if expired/missing. */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/** Store a value with a TTL in seconds. Use 0 for permanent (until invalidation). */
export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  store.set(key, {
    value,
    expiresAt: ttlSeconds === 0 ? 0 : Date.now() + ttlSeconds * 1000,
  });
}

/** Delete a specific cache key. */
export function cacheDel(key: string): void {
  store.delete(key);
}

/** Delete all keys matching a prefix. Used after write ops to bust stale data. */
export function cacheInvalidate(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/** Async get-or-fetch: returns cached value or calls fn() and caches the result. */
export async function cacheFetch<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await fn();
  cacheSet(key, value, ttlSeconds);
  return value;
}

// ── Cache key builders ───────────────────────────────────────────────

export const CacheKeys = {
  prices: (ids: string) => `prices:${ids}`,
  balance: (principal: string, chain: string) => `balance:${principal}:${chain}`,
  portfolio: (principal: string) => `portfolio:${principal}`,
  addresses: (principal: string) => `addresses:${principal}`,
  /** Prefix for all balance-related keys for a principal (used for invalidation). */
  userBalances: (principal: string) => `balance:${principal}:`,
  userPortfolio: (principal: string) => `portfolio:${principal}`,
} as const;

// ── TTL constants ────────────────────────────────────────────────────

export const TTL = {
  PRICES: 60,
  BALANCE: 30,
  PORTFOLIO: 30,
  ADDRESSES: 0, // permanent — derived addresses never change
} as const;
