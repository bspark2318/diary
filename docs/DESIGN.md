# Design

Living spec. Source of truth for architecture, schema, and key flows. Update when code changes. Rationale lives in `DECISIONS.md`.

## Architecture
- **Client**: React + Vite SPA. Holds all plaintext, keys, search index.
- **Server**: TypeScript, Hono on Node. Auth (WebAuthn + PRF) + encrypted blob store. Never sees plaintext or key K.
- **DB**: Postgres.
- **Client cache**: IndexedDB (entries + search index, encrypted).

## Schema
Source of truth: `server/migrations/*.sql`. Runner: `server/src/migrate.ts` (raw SQL, `schema_migrations` tracking, one transaction per file).

## Key flows
- **Signup** (built): `POST /api/auth/register/options` mints user UUID + challenge (PRF ext requested) → browser creates passkey → `register/verify` inserts `users` + `passkeys`, creates session. *Session 4 adds:* generate random K → wrap with PRF output → store; recovery code → wrap → store.
- **Login** (built): `login/options` (discoverable, no allowCredentials) → browser signs → `login/verify` looks up `passkeys` by credential id, verifies, bumps counter, inserts `sessions`, sets httpOnly `sid` cookie. `GET /api/me` → user id. *Session 4 adds:* PRF output → unwrap K locally.
- **Write**: TipTap JSON → AES-GCM(K) → PUT /entries/:date. Update local index + IndexedDB.
- **Load**: GET /entries?since=last_sync → decrypt → MiniSearch index → IndexedDB.
- **Search**: local MiniSearch only. Zero network.
- **Recovery**: recovery code → unwrap K → register new passkey → re-wrap.

## Dev
- Auth challenge store is an in-memory Map (5-min TTL, `chal` cookie). Fine for a single dev process; move to DB/Redis before multi-instance deploy.
- rpID `localhost`, origin `http://localhost:5173` hardcoded in `server/src/auth.ts`; make env-driven at deploy.
- `pnpm --filter server migrate` → apply pending migrations.
- `pnpm db` → Postgres on localhost:5433 (user/pw/db = diary). `pnpm dev` → server :3000 + client :5173 (proxies `/api`).

## Open
See `DECISIONS.md` → Open Questions.
