// Envelope encryption for master key K (D21, D25, D26). WebCrypto only, no deps.
const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>; // WebCrypto refuses the looser ArrayBufferLike-backed type

// PRF input is a fixed app constant: a per-passkey input would need the credential id before get(),
// which breaks discoverable (no-username) login. Per-passkey randomness lives in the HKDF salt instead.
export const PRF_INPUT = crypto.subtle.digest("SHA-256", enc.encode("diary-k-wrap-v1"));

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const AES = { name: "AES-GCM", length: 256 } as const;

async function hkdfKey(prf: ArrayBuffer, salt: Bytes) {
  const base = await crypto.subtle.importKey("raw", prf, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode("diary-wrap") }, base, AES, false, ["encrypt", "decrypt"]);
}
async function pbkdf2Key(code: string, salt: Bytes) {
  const base = await crypto.subtle.importKey("raw", enc.encode(normalizeCode(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 }, base, AES, false, ["encrypt", "decrypt"]);
}

// wrapped = nonce(12) ‖ AES-GCM(rawK)(48) = 60 bytes
async function wrap(wrapKey: CryptoKey, rawK: Bytes) {
  const nonce = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, wrapKey, rawK));
  const out = new Uint8Array(12 + ct.length);
  out.set(nonce); out.set(ct, 12);
  return out;
}
async function unwrap(wrapKey: CryptoKey, wrapped: Bytes) {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: wrapped.slice(0, 12) }, wrapKey, wrapped.slice(12));
  return importK(new Uint8Array(raw));
}

/** K as a non-extractable AES-GCM key: usable for entries, never readable by JS again. */
export const importK = (rawK: Bytes) => crypto.subtle.importKey("raw", rawK, "AES-GCM", false, ["encrypt", "decrypt"]);

export async function wrapWithPrf(rawK: Bytes, prf: ArrayBuffer) {
  const salt = randomBytes(16);
  return { salt, wrapped: await wrap(await hkdfKey(prf, salt), rawK) };
}
export const unwrapWithPrf = async (wrapped: Bytes, salt: Bytes, prf: ArrayBuffer) =>
  unwrap(await hkdfKey(prf, salt), wrapped);

export async function wrapWithRecovery(rawK: Bytes, code: string) {
  const salt = randomBytes(16);
  return { salt, wrapped: await wrap(await pbkdf2Key(code, salt), rawK) };
}
export const unwrapWithRecovery = async (wrapped: Bytes, salt: Bytes, code: string) =>
  unwrap(await pbkdf2Key(code, salt), wrapped);

// Recovery code: 128 random bits → base32 (26 chars) → xxxx-xxxx-… (D25)
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function generateRecoveryCode() {
  let out = "", acc = 0, bits = 0;
  for (const b of randomBytes(16)) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out += ALPHABET[(acc >>> bits) & 31]; }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(acc << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join("-");
}
export const normalizeCode = (code: string) => code.replace(/[^a-z0-9]/gi, "").toUpperCase();
