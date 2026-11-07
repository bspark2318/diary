// Encrypt/decrypt an entry with the in-memory master key K (AES-256-GCM, fresh 12-byte nonce per save).
import { getK } from "../crypto/key";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

function requireK(): CryptoKey {
  const k = getK();
  if (!k) throw new Error("locked: no key in memory");
  return k;
}

export async function seal(doc: unknown): Promise<{ ciphertext: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, requireK(), enc.encode(JSON.stringify(doc)));
  return { ciphertext: b64(ct), nonce: b64(nonce) };
}

export async function open(ciphertext: string, nonce: string): Promise<unknown> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(nonce) }, requireK(), unb64(ciphertext));
  return JSON.parse(dec.decode(pt));
}
