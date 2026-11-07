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
- **Write**: TipTap JSON → AES-GCM(K) → PUT /entries/:date (with `baseUpdatedAt`) → upsert into cache. See Local cache + sync.
- **Load**: IndexedDB → memory → GET /entries?since=last_sync−5s → upsert → decrypt on demand. See Local cache + sync.
- **Search**: local MiniSearch only. Zero network.
- **Recovery** (not built): recovery code → unwrap K → register new passkey → re-wrap. No PRF-less fallback (D23). *Open:* with signup closed (D28) and no username, the recovery flow needs a way to identify + authenticate the user from the code alone (e.g. a server-side verifier derived from the code) and an authenticated "add passkey" route.

## Local cache + sync (built, D34)
- **Code**: `client/src/cache/idb.ts` (promise wrapper; DB `diary`, stores `entries` keyed by date + `meta`), `client/src/entries/cache.ts` (memory map + sync), `client/src/entries/api.ts` (reads go through the cache).
- **Stored**: rows exactly as the server returns them (`ciphertext`, `nonce`, `updatedAt`) — still encrypted. `meta.last_sync` = max `updatedAt` from the last sync **response** (server time; never the client clock, never advanced by a local PUT).
- **Sync**: IDB → memory once, then `GET /api/entries?since=last_sync − 5 s` (server uses `>=`; client upsert is idempotent). Overlap covers a write whose txn started before a sync but committed after it (Postgres `now()` = txn start). Rows + cursor are written in one IDB transaction.
- **Reads**: `listEntries()` syncs then returns local rows; `getEntry()` only waits for the session's first sync. No per-day network calls. Re-sync on tab `visibilitychange` (Diary.tsx); no polling.
- **Write**: `putEntry()` → server → upsert the returned `updatedAt` into memory + IDB. Conflicts stay server-side (D32 409).
- **Lifecycle**: reload keeps IDB (K is gone → "locked" → Unlock → instant). Logout (`onKeyChange` non-null → null) wipes memory + IDB. IDB failure (private mode, quota) → silent memory-only mode.
- **Not cached**: the search index — rebuilt from decrypted entries on each unlock (D33/D34).
- **Open**: deletions (none in v1; a cleared day keeps its row), multi-tab (each tab syncs independently; last PUT wins via 409).

## Dev
- Auth challenge store is an in-memory Map (5-min TTL, `chal` cookie). Fine for a single dev process; move to DB/Redis before multi-instance deploy.
- rpID `localhost`, origin `http://localhost:5173` hardcoded in `server/src/auth.ts`; make env-driven at deploy.
- PRF input = `sha256("diary-k-wrap-v1")`, computed client-side (`client/src/crypto/wrap.ts`); the server never needs it.
- `pnpm --filter server migrate` → apply pending migrations.
- `pnpm db` → Postgres on localhost:5433 (user/pw/db = diary). `pnpm dev` → server :3000 + client :5173 (proxies `/api`).

## Open
See `DECISIONS.md` → Open Questions.
