# Design

Living spec. Source of truth for architecture, schema, and key flows. Update when code changes. Rationale lives in `DECISIONS.md`.

## Architecture
- **Client**: React + Vite SPA. Holds all plaintext, keys, search index.
- **Server**: TypeScript, Hono on Node. Auth (WebAuthn + PRF) + encrypted blob store. Never sees plaintext or key K.
- **DB**: Postgres.
- **Client cache**: IndexedDB (entries + search index, encrypted).

## Schema
Source of truth: `server/migrations/*.sql`. Runner: `server/src/migrate.ts` (raw SQL, `schema_migrations` tracking, one transaction per file).
- **Key wraps** (002): K is wrapped **per passkey** (`passkeys.wrapped_k`, `passkeys.salt`; null until first PRF eval) because PRF output is per-credential. Recovery wrap lives on `users.recovery_wrapped_k` / `recovery_salt`.
- **Role** (002): `users.role` text `'user'|'admin'`, first registered user becomes admin. `GET /api/me` returns `{ userId, role }`.

## Key flows
- **Signup** (built, D23/D27/D28): `register/options` → 403 once any user exists. Else mints user UUID + challenge → client injects `prf.eval.first = PRF_INPUT` → `create()` → client **and** server refuse if `clientExtensionResults.prf.enabled !== true` (no user row is created) → `register/verify` inserts `users` (first = admin) + `passkeys`, session, returns `credentialId`. Client then generates K (32 random) + recovery code; PRF bytes from `create()` results if present, else an immediate `get()` with `prf.eval`; wraps K twice → `PUT /api/keys/prf` (`{credentialId, wrappedK, salt}`) + `PUT /api/keys/recovery` (`{wrappedK, salt}`). Recovery code shown once; "I saved it" to continue.
- **Login / unlock** (built): `login/options` (discoverable) → client injects `prf.eval` → `get()` → `login/verify` verifies, bumps counter, creates session, returns `{ userId, role, credentialId, wrappedK, salt, hasRecovery }` → client unwraps K with the PRF output. K is a non-extractable `CryptoKey` in memory only (`client/src/crypto/key.ts`: `getK()`, `onKeyChange()`), so a reload = locked → "Unlock" re-runs the same flow. If `wrappedK` is null and `hasRecovery` is false (signup interrupted) the client finishes setup; if `hasRecovery` is true it needs the recovery enrollment flow (D24b, not built).
- **Key wrap** (D21, D25, D26): PRF input = `sha256("diary-k-wrap-v1")` (fixed; per-passkey input would break discoverable login). `HKDF-SHA256(prf, salt=passkeys.salt[16], info="diary-wrap")` → AES-256-GCM → `wrapped_k = nonce[12] ‖ ct[48]`. Recovery: `PBKDF2-SHA256(code, users.recovery_salt[16], ~600k)` → same AES-GCM layout → `users.recovery_wrapped_k`. Recovery code = 128-bit random, base32, `xxxx-xxxx-…`.
- **Second passkey** (D24): synced (iCloud) → same credential, nothing to do. New device → recovery code → unwrap K → create passkey → PRF eval → wrap → store on that `passkeys` row.
- **Write**: TipTap JSON → AES-GCM(K) → PUT /entries/:date. Update local index + IndexedDB.
- **Load**: GET /entries?since=last_sync → decrypt → MiniSearch index → IndexedDB.
- **Search**: local MiniSearch only. Zero network.
- **Recovery** (not built): recovery code → unwrap K → register new passkey → re-wrap. No PRF-less fallback (D23). *Open:* with signup closed (D28) and no username, the recovery flow needs a way to identify + authenticate the user from the code alone (e.g. a server-side verifier derived from the code) and an authenticated "add passkey" route.

## Session 6 design — IndexedDB cache + incremental sync (notes only, no code yet)
- **Stores** (one IDB database `diary`, versioned): `entries` keyed by `date` → `{ ciphertext, nonce, updated_at }` exactly as the server returns them (still encrypted; IDB is as untrusted as the server). `meta` → `{ last_sync }`.
- **Cold start**: read all of `entries` from IDB → decrypt with K → build MiniSearch index in memory → render. Then `GET /api/entries?since=last_sync` → upsert rows into IDB + the in-memory index → `meta.last_sync = max(updated_at)` from the response (server clock, not client).
- **Write**: encrypt → `PUT /api/entries/:date` → on 2xx write the row (with server's `updated_at`) to IDB and the index. No offline queue in v1: a failed PUT is surfaced, not retried later.
- **Conflicts**: one entry per day per user, last write wins by `updated_at`; server is authoritative. Multi-device edits of the same day will clobber — acceptable for v1.
- **Index cache**: v1 rebuilds MiniSearch from decrypted entries at load (fast enough at ~7 MB / 10 yrs). Caching the serialized index (`JSON.stringify(index)` → AES-GCM(K) → IDB) is an optimization for later; adds invalidation complexity.
- **Lock/logout**: K is memory-only; IDB content stays encrypted at rest. Logout clears IDB (`meta` + `entries`) so a shared machine holds nothing.
- **Open**: deletions (tombstone row vs hard delete + `deleted_at`), `since` precision (use `>=` and dedupe, or `>` with a monotonic server timestamp), quota/eviction behaviour in Safari.

## Dev
- Auth challenge store is an in-memory Map (5-min TTL, `chal` cookie). Fine for a single dev process; move to DB/Redis before multi-instance deploy.
- rpID `localhost`, origin `http://localhost:5173` hardcoded in `server/src/auth.ts`; make env-driven at deploy.
- PRF input = `sha256("diary-k-wrap-v1")`, computed client-side (`client/src/crypto/wrap.ts`); the server never needs it.
- `pnpm --filter server migrate` → apply pending migrations.
- `pnpm db` → Postgres on localhost:5433 (user/pw/db = diary). `pnpm dev` → server :3000 + client :5173 (proxies `/api`).

## Open
See `DECISIONS.md` → Open Questions.
