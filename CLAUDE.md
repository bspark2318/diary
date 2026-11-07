# diary

Personal diary web app. Solo learning project (system design: auth, search, encryption). Built multi-user-ready; public later maybe.

## Docs — read first
- `docs/DECISIONS.md` — numbered decisions + rationale + open questions. **Append, never rewrite history.** New decision → next Dn + Log entry.
- `docs/DESIGN.md` — living spec (arch, schema, flows). Update when code changes it.
- `docs/sessions/YYYY-MM-DD.md` — one note per session: Done / Next. Create at session start, fill at end.

## Stack (see DECISIONS for why)
- Client: React + Vite SPA, TipTap editor, MiniSearch, IndexedDB.
- Server: TypeScript, Postgres. WebAuthn passkeys + PRF.
- E2E encrypted: server never sees plaintext or key K. Search is client-side only.

## Process
- No SDD. Talk → log decision → build in one shot → session note.
- Hosting: Minisforum 790 (not yet set up). Dev locally.
