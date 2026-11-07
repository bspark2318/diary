// Minimal promise wrapper over IndexedDB. DB "diary": `entries` (keyPath date) + `meta` (key → value).
const NAME = "diary", VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;

const done = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

function open() {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("entries", { keyPath: "date" });
      r.result.createObjectStore("meta");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

export async function readAll<T>(): Promise<{ entries: T[]; lastSync: string | null }> {
  const tx = (await open()).transaction(["entries", "meta"]);
  const [entries, lastSync] = await Promise.all([
    done(tx.objectStore("entries").getAll() as IDBRequest<T[]>),
    done(tx.objectStore("meta").get("last_sync") as IDBRequest<string | undefined>),
  ]);
  return { entries, lastSync: lastSync ?? null };
}

/** Upsert rows and (optionally) advance the cursor in ONE transaction, so last_sync never outruns the rows. */
export async function write(rows: unknown[], lastSync?: string) {
  const tx = (await open()).transaction(["entries", "meta"], "readwrite");
  for (const r of rows) tx.objectStore("entries").put(r);
  if (lastSync !== undefined) tx.objectStore("meta").put(lastSync, "last_sync");
  await complete(tx);
}

export async function clear() {
  const tx = (await open()).transaction(["entries", "meta"], "readwrite");
  tx.objectStore("entries").clear();
  tx.objectStore("meta").clear();
  await complete(tx);
}
