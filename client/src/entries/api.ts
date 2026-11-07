export type EntryRow = { date: string; ciphertext: string; nonce: string; updatedAt: string };

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function listEntries(): Promise<EntryRow[]> {
  const r = await fetch("/api/entries");
  if (!r.ok) throw new Error(`list failed: ${r.status}`);
  return r.json();
}

export async function getEntry(date: string): Promise<EntryRow | null> {
  const r = await fetch(`/api/entries/${date}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`get failed: ${r.status}`);
  return r.json();
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
  return r.json();
}
