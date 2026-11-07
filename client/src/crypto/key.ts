// Interface contract (S4 owns the implementation). Holds the master key K in memory only.
let k: CryptoKey | null = null;
const subs = new Set<(k: CryptoKey | null) => void>();

export function getK(): CryptoKey | null {
  return k;
}
export function onKeyChange(cb: (k: CryptoKey | null) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}
export function setK(next: CryptoKey | null) {
  k = next;
  subs.forEach((cb) => cb(k));
}
