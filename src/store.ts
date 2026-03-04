import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Identity store — maps `channel:senderId` to ICP principals with
 * ownership verification status.
 * Persisted as JSON in `{stateDir}/plugins/menese-protocol/identities.json`.
 */

export interface IdentityEntry {
  principal: string;
  verified: boolean;
  /** Derived ETH address the user must provide back to prove ownership */
  challengeAddress?: string;
}

export interface IdentityStore {
  resolve(channel: string, senderId: string): string | null;
  getEntry(channel: string, senderId: string): IdentityEntry | null;
  link(channel: string, senderId: string, principal: string): void;
  unlink(channel: string, senderId: string): void;
  setChallenge(channel: string, senderId: string, address: string): void;
  markVerified(channel: string, senderId: string): void;
  isVerified(channel: string, senderId: string): boolean;
}

/** Supports both legacy string values and new IdentityEntry objects */
type IdentityMap = Record<string, IdentityEntry | string>;

/**
 * ICP principal textual format: groups of 5 base32 chars separated by dashes.
 * Last group can be 1-5 chars. Valid chars: a-z, 2-7 (base32 lowercase).
 * Examples:
 *   ewcc5-fiaaa-aaaab-afafq-cai          (canister)
 *   4jzjr-ob6oo-sb3ew-eeaxp-444x7-...   (user)
 *   2vxsx-fae                             (anonymous)
 */
const PRINCIPAL_GROUP_RE = /^[a-z2-7]{5}(-[a-z2-7]{1,5})+$/;

export function isValidPrincipal(value: string): boolean {
  if (!PRINCIPAL_GROUP_RE.test(value)) return false;
  const groups = value.split("-");
  // All groups except the last must be exactly 5 chars
  for (let i = 0; i < groups.length - 1; i++) {
    if (groups[i].length !== 5) return false;
  }
  return true;
}

/** Normalize legacy string entries to IdentityEntry objects */
function normalize(value: IdentityEntry | string): IdentityEntry {
  if (typeof value === "string") {
    return { principal: value, verified: false };
  }
  return value;
}

function makeKey(channel: string, senderId: string): string {
  return `${channel}:${senderId}`;
}

export function createIdentityStore(stateDir: string): IdentityStore {
  const dir = path.join(stateDir, "plugins", "menese-protocol");
  const filePath = path.join(dir, "identities.json");

  function load(): IdentityMap {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as IdentityMap;
      }
    } catch {
      // File doesn't exist yet or is malformed — start fresh
    }
    return {};
  }

  function save(map: IdentityMap): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2) + "\n", "utf-8");
  }

  return {
    resolve(channel, senderId) {
      const map = load();
      const raw = map[makeKey(channel, senderId)];
      if (!raw) return null;
      return normalize(raw).principal;
    },

    getEntry(channel, senderId) {
      const map = load();
      const raw = map[makeKey(channel, senderId)];
      if (!raw) return null;
      return normalize(raw);
    },

    link(channel, senderId, principal) {
      const map = load();
      map[makeKey(channel, senderId)] = { principal, verified: false };
      save(map);
    },

    unlink(channel, senderId) {
      const map = load();
      const key = makeKey(channel, senderId);
      if (key in map) {
        delete map[key];
        save(map);
      }
    },

    setChallenge(channel, senderId, address) {
      const map = load();
      const key = makeKey(channel, senderId);
      const raw = map[key];
      if (!raw) return;
      const entry = normalize(raw);
      entry.challengeAddress = address.toLowerCase();
      map[key] = entry;
      save(map);
    },

    markVerified(channel, senderId) {
      const map = load();
      const key = makeKey(channel, senderId);
      const raw = map[key];
      if (!raw) return;
      const entry = normalize(raw);
      entry.verified = true;
      delete entry.challengeAddress;
      map[key] = entry;
      save(map);
    },

    isVerified(channel, senderId) {
      const map = load();
      const raw = map[makeKey(channel, senderId)];
      if (!raw) return false;
      return normalize(raw).verified;
    },
  };
}
