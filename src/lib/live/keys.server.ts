/**
 * Provider keys, typed into ALGM's own settings box.
 *
 * They live in one file on the machine running ALGM, readable only by the
 * account that runs it (0600). They are never sent back to the browser: the
 * page only ever sees whether a key is set and its last four characters.
 * No .env file, nothing to edit by hand.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "./providers.ts";

export function dataDir() {
  return process.env.ALGM_DATA_DIR || join(homedir(), ".algm");
}

function keyFile() {
  return join(dataDir(), "provider-keys.json");
}

function readAll(): Partial<Record<ProviderId, string>> {
  const f = keyFile();
  if (!existsSync(f)) return {};
  try {
    const v = JSON.parse(readFileSync(f, "utf8"));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function writeAll(keys: Partial<Record<ProviderId, string>>) {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const f = keyFile();
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(keys, null, 2), { mode: 0o600 });
  renameSync(tmp, f);
  chmodSync(f, 0o600);
}

export function getKey(p: ProviderId): string | undefined {
  const k = readAll()[p];
  return typeof k === "string" && k.trim() ? k.trim() : undefined;
}

export function setKey(p: ProviderId, key: string) {
  const all = readAll();
  all[p] = key.trim();
  writeAll(all);
}

export function clearKey(p: ProviderId) {
  const all = readAll();
  delete all[p];
  writeAll(all);
}

/** What the page is allowed to know: set or not, and the last four characters. */
export function keySummary(): Partial<Record<ProviderId, { set: true; last4: string }>> {
  const out: Partial<Record<ProviderId, { set: true; last4: string }>> = {};
  for (const [p, k] of Object.entries(readAll())) {
    if (typeof k === "string" && k.trim()) out[p as ProviderId] = { set: true, last4: k.trim().slice(-4) };
  }
  return out;
}
