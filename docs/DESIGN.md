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
- **Signup**: register passkey (PRF enabled) → generate random K → wrap K with PRF output → store wrap; generate recovery code → wrap K → store wrap.
- **Login**: passkey assertion → server session; PRF output → unwrap K locally.
- **Write**: TipTap JSON → AES-GCM(K) → PUT /entries/:date. Update local index + IndexedDB.
- **Load**: GET /entries?since=last_sync → decrypt → MiniSearch index → IndexedDB.
- **Search**: local MiniSearch only. Zero network.
- **Recovery**: recovery code → unwrap K → register new passkey → re-wrap.

## Dev
- `pnpm --filter server migrate` → apply pending migrations.
- `pnpm db` → Postgres on localhost:5433 (user/pw/db = diary). `pnpm dev` → server :3000 + client :5173 (proxies `/api`).

## Open
See `DECISIONS.md` → Open Questions.
