import * as cache from "./cache";

export type EntryRow = { date: string; ciphertext: string; nonce: string; updatedAt: string };

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Reads go through the local cache (S6): listEntries syncs, getEntry only waits for the first sync.
export async function listEntries(): Promise<EntryRow[]> {
  await cache.sync();
  return cache.all();
}

export async function getEntry(date: string): Promise<EntryRow | null> {
  await cache.ready();
  return cache.one(date);
}

export class Conflict extends Error {
  updatedAt: string | null;
  constructor(updatedAt: string | null) {
    super("conflict");
    this.updatedAt = updatedAt;
  }
}

export async function putEntry(date: string, body: { ciphertext: string; nonce: string }, baseUpdatedAt: string | null): Promise<{ updatedAt: string }> {
  const r = await fetch(`/api/entries/${date}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, baseUpdatedAt }),
  });
  if (r.status === 409) throw new Conflict((await r.json()).updatedAt);
  if (!r.ok) throw new Error(`put failed: ${r.status}`);
  const res: { updatedAt: string } = await r.json();
  await cache.upsert({ date, ...body, updatedAt: res.updatedAt });
  return res;
}
