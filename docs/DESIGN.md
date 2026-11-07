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
- **Signup** (built): `POST /api/auth/register/options` mints user UUID + challenge (PRF ext requested) → browser creates passkey → `register/verify` inserts `users` + `passkeys`, creates session. *Session 4 adds (D23, D27):* if `prf.enabled` false → server deletes user+passkey, client shows "unsupported browser". Else client generates K (32 random) + recovery code; PRF bytes from `create()` results if present, else immediate `get()` with `prf.eval`; wraps K twice (PRF + recovery, see Key wrap) → `POST /api/keys/wrap`. Recovery code shown once, must be acknowledged.
- **Login** (built): `login/options` (discoverable, no allowCredentials) → browser signs → `login/verify` looks up `passkeys` by credential id, verifies, bumps counter, inserts `sessions`, sets httpOnly `sid` cookie. `GET /api/me` → `{ userId, role }`. *Session 4 adds:* `prf.eval` with fixed input → server returns `wrapped_k` + `salt` for that passkey → client unwraps K, keeps it in memory only.
- **Key wrap** (D21, D25, D26): PRF input = `sha256("diary-k-wrap-v1")` (fixed; per-passkey input would break discoverable login). `HKDF-SHA256(prf, salt=passkeys.salt[16], info="diary-wrap")` → AES-256-GCM → `wrapped_k = nonce[12] ‖ ct[48]`. Recovery: `PBKDF2-SHA256(code, users.recovery_salt[16], ~600k)` → same AES-GCM layout → `users.recovery_wrapped_k`. Recovery code = 128-bit random, base32, `xxxx-xxxx-…`.
- **Second passkey** (D24): synced (iCloud) → same credential, nothing to do. New device → recovery code → unwrap K → create passkey → PRF eval → wrap → store on that `passkeys` row.
- **Write**: TipTap JSON → AES-GCM(K) → PUT /entries/:date. Update local index + IndexedDB.
- **Load**: GET /entries?since=last_sync → decrypt → MiniSearch index → IndexedDB.
- **Search**: local MiniSearch only. Zero network.
- **Recovery**: recovery code → unwrap K → register new passkey → re-wrap. No PRF-less fallback (D23).

## Dev
- Auth challenge store is an in-memory Map (5-min TTL, `chal` cookie). Fine for a single dev process; move to DB/Redis before multi-instance deploy.
- rpID `localhost`, origin `http://localhost:5173` hardcoded in `server/src/auth.ts`; make env-driven at deploy.
- `pnpm --filter server migrate` → apply pending migrations.
- `pnpm db` → Postgres on localhost:5433 (user/pw/db = diary). `pnpm dev` → server :3000 + client :5173 (proxies `/api`).

## Open
See `DECISIONS.md` → Open Questions.
