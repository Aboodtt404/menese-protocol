import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Identity store — maps `channel:senderId` to ICP principals.
 * Persisted as JSON in `{stateDir}/plugins/menese-protocol/identities.json`.
 */

export interface IdentityStore {
  resolve(channel: string, senderId: string): string | null;
  link(channel: string, senderId: string, principal: string): void;
  unlink(channel: string, senderId: string): void;
}

type IdentityMap = Record<string, string>;

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
      return map[makeKey(channel, senderId)] ?? null;
    },

    link(channel, senderId, principal) {
      const map = load();
      map[makeKey(channel, senderId)] = principal;
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
  };
}
