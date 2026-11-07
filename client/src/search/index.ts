// Browser-only inverted index over decrypted entries (D33). Nothing here touches the server.
import MiniSearch from "minisearch";
import { listEntries } from "../entries/api";
import { open } from "../entries/seal";

type Doc = { date: string; text: string };

// Flatten TipTap JSON → plain text: collect every `text` node, join with spaces.
export function toText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  return (n.content ?? []).map(toText).join(" ");
}

// Data source seam: S5 = fetch + decrypt everything; S6 will point this at the IndexedDB cache.
async function loadAll(): Promise<Doc[]> {
  const rows = await listEntries();
  return Promise.all(rows.map(async (r) => ({ date: r.date, text: toText(await open(r.ciphertext, r.nonce)) })));
}

const ms = new MiniSearch<Doc>({
  idField: "date",
  fields: ["text"],
  storeFields: ["text"],
  searchOptions: { prefix: true, fuzzy: 0.2 },
});

export async function buildIndex() {
  ms.removeAll();
  ms.addAll(await loadAll());
}

// After autosave: replace that one day's doc (D33).
export function indexDay(date: string, doc: unknown) {
  const d = { date, text: toText(doc) };
  if (ms.has(date)) ms.replace(d); else ms.add(d);
}

export type Hit = { date: string; snippet: string };

export function search(query: string, limit = 20): Hit[] {
  if (!query.trim()) return [];
  return ms
    .search(query)
    .sort((a, b) => b.score - a.score || b.id.localeCompare(a.id))   // BM25, newest-first tiebreak
    .slice(0, limit)
    .map((r) => ({ date: r.id, snippet: snippet(r.text as string, r.terms) }));
}

function snippet(text: string, terms: string[], width = 90): string {
  const lower = text.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t.toLowerCase())).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - width / 3);
  const s = text.slice(start, start + width).trim();
  return (start > 0 ? "…" : "") + s + (start + width < text.length ? "…" : "");
}
