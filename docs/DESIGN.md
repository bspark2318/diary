# Design

Living spec. Source of truth for architecture, schema, and key flows. Update when code changes. Rationale lives in `DECISIONS.md`.

## Architecture
- **Client**: React + Vite SPA. Holds all plaintext, keys, search index.
- **Server**: TypeScript, Hono on Node. Auth (WebAuthn + PRF) + encrypted blob store. Never sees plaintext or key K.
- **DB**: Postgres.
- **Client cache**: IndexedDB (entries + search index, encrypted).

## Schema (draft)
```
users(id, created_at)
passkeys(id, user_id, public_key, counter, transports, created_at)
key_wraps(user_id, kind: 'prf'|'recovery', wrapped_k, salt)
entries(user_id, date, ciphertext, nonce, updated_at)  PK(user_id, date)
sessions(id, user_id, expires_at)
```

## Key flows
- **Signup**: register passkey (PRF enabled) → generate random K → wrap K with PRF output → store wrap; generate recovery code → wrap K → store wrap.
- **Login**: passkey assertion → server session; PRF output → unwrap K locally.
- **Write**: TipTap JSON → AES-GCM(K) → PUT /entries/:date. Update local index + IndexedDB.
- **Load**: GET /entries?since=last_sync → decrypt → MiniSearch index → IndexedDB.
- **Search**: local MiniSearch only. Zero network.
- **Recovery**: recovery code → unwrap K → register new passkey → re-wrap.

## Open
See `DECISIONS.md` → Open Questions.
