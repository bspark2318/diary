// Local copy of the user's encrypted entries (D33): memory map backed by IndexedDB, synced incrementally.
import type { EntryRow } from "./api";
import * as idb from "../cache/idb";
import { onKeyChange } from "../crypto/key";

const OVERLAP_MS = 5_000; // Postgres now() is txn start: a slow write can commit after a sync with an earlier stamp.

const rows = new Map<string, EntryRow>();
let lastSync: string | null = null;   // server's max updatedAt seen so far; never set from a local PUT or the client clock
let loaded: Promise<void> | null = null;
let inflight: Promise<number> | null = null;
let idbOk = true;                     // false → memory-only (private mode, quota); every load is a full fetch

async function load() {
  try {
    const stored = await idb.readAll<EntryRow>();
    for (const r of stored.entries) rows.set(r.date, r);
    lastSync = stored.lastSync;
  } catch {
    idbOk = false;
  }
}

async function doSync() {
  await (loaded ??= load());
  const since = lastSync ? `?since=${encodeURIComponent(new Date(Date.parse(lastSync) - OVERLAP_MS).toISOString())}` : "";
  const r = await fetch(`/api/entries${since}`);
  if (!r.ok) throw new Error(`sync failed: ${r.status}`);
  const changed: EntryRow[] = await r.json();
  if (!changed.length) return 0;
  for (const e of changed) rows.set(e.date, e);
  lastSync = changed.reduce((m, e) => (e.updatedAt > m ? e.updatedAt : m), lastSync ?? ""); // ISO-8601 Z strings sort lexically
  await persist(changed, lastSync);
  return changed.length;
}

async function persist(list: EntryRow[], cursor?: string) {
  if (!idbOk) return;
  await idb.write(list, cursor).catch(() => { idbOk = false; });
}

/** Pull changes from the server; resolves to the number of changed rows. Concurrent callers share one request. */
export function sync(): Promise<number> {
  return (inflight ??= doSync().finally(() => { inflight = null; }));
}
/** Resolve once this session has synced at least once (reads are local after that). */
export async function ready() {
  if (!(lastSync !== null && loaded)) await sync();
}

export const all = () => [...rows.values()];
export const one = (date: string) => rows.get(date) ?? null;

/** Record a row we just wrote. Does not move the cursor: another device's earlier write could sit between. */
export async function upsert(row: EntryRow) {
  rows.set(row.date, row);
  await persist([row]);
}

async function reset() {
  rows.clear();
  lastSync = null;
  loaded = null;
  if (idbOk) await idb.clear().catch(() => {});
}

// Logout (K non-null → null) wipes the cache so a shared machine holds nothing.
// A reload starts with K null and fires no change, so the encrypted cache survives → instant unlock.
let hadKey = false;
onKeyChange((k) => {
  if (k) hadKey = true;
  else if (hadKey) { hadKey = false; reset(); }
});
