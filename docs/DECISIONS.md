# Decisions

Running decision log (ADR-style). **Decisions** (settled, numbered Dn), **Open Questions**, **Ideas / Parking Lot**, **Log** (chronological).

## Decisions
- **D1 — Audience**: single user (me) now; architect as multi-user from day one (auth, per-user data isolation).
- **D2 — Primary client**: browser web app first. Mobile/local-files later, if ever.
- **D3 — Content**: text only for v1. No media.
- **D5 — Learning targets**: auth, search, data encryption. Design choices should favor doing these properly over shortcuts.
- **D6 — Text format**: start rich text; cut features down based on real use. (Alternative considered: start plain, grow.)
- **D7 — Entry model**: one entry per day per user.
- **D8 — Encryption**: at rest required. E2E under consideration (see Open Questions).
- **D9 — Client cache**: use IndexedDB to cache the encrypted search index + entries locally. Instant login #2; incremental sync via `updated_at`.
- **D10 — Architecture**: arch B — E2E encryption, server = auth + encrypted blob store, search index built & cached in browser (MiniSearch + IndexedDB). Password recovery via master key K wrapped by password + recovery code.
- **D11 — Auth**: passkeys (WebAuthn) with **PRF extension**. One Face ID tap = login + derive secret that unwraps master key K. No password. Roll own WebAuthn server flow (learning). Recovery code as backup for K. Requires Safari 18+/iOS 18+/Chrome 116+.
- **D12 — Backend**: TypeScript. Framework/runtime TBD (Hono or Fastify; Node or Bun). Postgres.
- **D13 — Frontend**: React + Vite SPA. No SSR (entries are client-decrypted).
- **D14 — Editor**: TipTap (ProseMirror). Store `editor.getJSON()` encrypted; index `editor.getText()` client-side.
- **D15 — Hosting**: Minisforum 790 home server (new, 2026-11-06). HTTPS via Cloudflare Tunnel or similar (passkeys require HTTPS + real domain).
- **D16 — Server framework**: Hono on Node. Alternative: Fastify (heavier, Node-only). Runtime Bun deferred.
- **D17 — Process**: one topic per session, learning-paced (not one-shot). Roadmap: 1 scaffold · 2 schema/migrations · 3 passkeys · 4 PRF+key K · 5 entries+editor · 6 IndexedDB+sync · 7 search (MiniSearch) · 8 deploy.
- **D18 — DB access**: raw SQL via `pg` + hand-rolled migration runner (`server/migrations/NNN_name.sql`, `schema_migrations` table). No ORM. Alternatives: Drizzle, Kysely.
- **D19 — Admin role**: user is admin of the site. `users.role` ('user'|'admin'), first user bootstrapped as admin. Admin powers: list/delete users, invites, stats. Admin **cannot** read entries (E2E). Migration + UI in a later session.
- **D20 — Key wraps live with their unlocker**: dropped `key_wraps`. PRF output is per-passkey → `passkeys.wrapped_k/salt` (nullable until first login). Recovery wrap → `users.recovery_wrapped_k/recovery_salt`. `users.role text check in ('user','admin')`, first user = admin. Migration 002. Rationale: envelope encryption — one data key K, one wrap per unlocker.
- **D21 — PRF input**: fixed app constant (`sha256("diary-k-wrap-v1")`), not per-passkey. Per-passkey salt would need the credential id *before* `get()`, breaking discoverable (no-username) login. `passkeys.salt` is the HKDF salt instead.
- **D22 — Sessions table stays** (vs signed JWT cookie): revocation + device list worth one index lookup per request. `passkeys.counter` kept per spec though Apple synced passkeys always report 0.
- **D23 — No-PRF fallback: block.** After `create()`, if `clientExtensionResults.prf.enabled` is false → server deletes the just-created user+passkey, client shows "unsupported browser". Rejected: passphrase fallback (second secret, violates D11), recovery-code-as-login. (settled in peer session diary-f5)
- **D24 — Second passkey enrollment**: needs K in memory on the enrolling device. (a) iCloud-synced passkey → same credential, same PRF, nothing to do. (b) New non-synced device → enter recovery code → unwrap K → create passkey → PRF eval → wrap K → store on that passkeys row. No QR/cross-device handoff in v1. (settled in peer session diary-f5)
- **D25 — Recovery code**: 128-bit random → base32, grouped `xxxx-xxxx-…` (~26 chars), shown once at signup. KDF: PBKDF2-SHA256 (WebCrypto, ~600k iterations) with random 16-byte `users.recovery_salt` → wrap key → `users.recovery_wrapped_k`. Argon2id rejected: overkill for a 128-bit random secret, needs a dependency. (settled in peer session diary-f5)
- **D26 — K wrap recipe**: WebCrypto only. `HKDF-SHA256(prfBytes, salt=passkeys.salt (16 random), info="diary-wrap")` → AES-256-GCM key. `wrapped_k = nonce(12) ‖ ciphertext(48)` = 60 bytes. Same layout for `users.recovery_wrapped_k` with PBKDF2-derived key (D25).
- **D27 — When to wrap K**: at signup, client generates K (32 random) + recovery code. Try PRF at `create()`; if `clientExtensionResults.prf.results` present → wrap immediately (one Face ID). Else → immediate `get()` with `prf.eval` → wrap (two Face IDs). Then POST both wraps. Recovery code shown once, must be acknowledged. Rejected: lazy wrap at first entry (same second prompt, worse failure modes).
- **D28 — Signup closed after first user**: first registration becomes admin, then `register/options` returns 403. Invites deferred (not needed; "just me" for now). Admin UI deferred.
- **D29 — "Today" = browser-local date** (`YYYY-MM-DD` from `Date` in the client's zone). No per-user timezone column. Alternative rejected: server/UTC date (wrong near midnight for the writer).
- **D30 — Autosave**: debounce 1 s after last keystroke → encrypt → PUT. No save button. Empty days have no row; a row is created on first autosave.
- **D31 — Navigation**: sidebar list of dates (newest first, today pinned on top even if empty) + editor on the right. Dates come from `GET /api/entries` (S6 will cache). Rejected for v1: prev/next arrows only, calendar grid, infinite scroll.
- **D32 — Conflict handling**: optimistic locking in v1. Client sends `baseUpdatedAt` (the `updatedAt` it loaded, or null for new). Server PUT rejects with 409 if row's `updated_at` differs → client reloads and shows notice. Plus resync on tab focus (S6). Rejected: last-write-wins silently.
- **D33 — Search (S7)**: MiniSearch in browser. Index = plain text flattened from TipTap JSON (all `text` nodes joined), one doc per date. Built in memory after unlock from all decrypted entries (data source = `loadAll()` seam: S5 fetch now, S6 cache later). Prefix + fuzzy(1) on; BM25 rank, newest-first tiebreak. Results = date + snippet, replace sidebar list while query non-empty. After each autosave, `replace()` that day's doc. Not persisted (S6 may cache serialized index).
- **D34 — Client cache + sync (S6)**: IndexedDB stores rows exactly as served (ciphertext, nonce, updatedAt keyed by date) + `meta.last_sync`. Plaintext on disk rejected (breaks at-rest). Cursor = max `updatedAt` from last sync *response* (server time, never a local PUT); request `since = last_sync − 5 s` overlap, client upsert idempotent (Postgres `now()` is txn-start; slow commits can land after a sync). Server sequence counter rejected for v1. One sync per unlock, then local-only reads; re-sync on `visibilitychange`, no polling. Reload keeps IDB → instant unlock; logout wipes IDB; IDB unavailable → memory-only fallback. Search index not persisted (narrows D9: cache index only if unlock gets slow). (settled in peer session diary-f5)
- **D35 — Visual direction**: "Notion × paper" hybrid. Notion's structure (left sidebar, big title, Inter UI chrome) + paper warmth (off-white `#faf7f2`, Source Serif 4 body, rust accent `#a0522d`, no emoji). Plain CSS variables, no Tailwind. Mockups A (paper), B (dark minimal), C (Notion) rejected: A too precious, B too stark, C too Notion. Differentiation is product (E2E, one-page-per-day, passkey-only, self-hosted), not skin.
- **D4 — Motivation**: (a) learn system design hands-on, (b) tool tailored to my own habits, (c) possibly open to public later.

## Open Questions
- Admin powers/UI: deferred until multi-user.
- Multi-user "day one": full auth now, or single-user with clean seams for later?
- WebAuthn server library (e.g. SimpleWebAuthn) vs fully hand-rolled?
- Domain name + HTTPS method (Cloudflare Tunnel vs Caddy + port-forward)?
- Minisforum not yet set up (as of 2026-11-06). OS, SSH, Docker vs systemd all TBD. Dev locally until then.
- Must-haves vs nice-to-haves?

## Ideas / Parking Lot
- **Candidate arch (E2E + blind index)**: one Postgres DB. `entries(user_id, date, ciphertext, nonce)` forward store; `entry_tokens(user_id, token_hash, date)` blind index where `token_hash = HMAC(K, word)`. Key `K` derived client-side from password; server never holds plaintext or key. No Elasticsearch (needs plaintext). Tradeoffs: exact-word only, leaks word-frequency patterns, lost password = lost data.
- **Candidate arch B (E2E + client-side index)** — current favorite: server = auth + encrypted blob store `entries(user_id, date, ciphertext, nonce, updated_at)`. Browser decrypts all entries, builds MiniSearch/FlexSearch index, caches encrypted in IndexedDB, syncs incrementally via `updated_at`. Full prefix/fuzzy/rank. ~7 MB for 10 yrs. Password recovery via random master key K wrapped by password + printed recovery code.
- Alternative: at-rest encryption + server-side search (Postgres FTS or Elasticsearch). Simpler, server can read entries.

## Log
- **2026-11-06** — D28 signup closed. Parallel build: peer diary-f5 → S4 (key K) + S6 prep; this session → S5 (entries + editor) against `getK()` interface.
- **2026-11-06** — Session 4 design split with peer session diary-f5: D21–D27 settled. 002 pushed (d390465).
- **2026-11-06** — Session 3 passkeys built (bd97280). D20: schema fix, migration 002 (built by peer session diary-f5).
- **2026-11-06** — D16: Hono.
- **2026-11-06** — D12–D15: TypeScript, React+Vite, TipTap, Minisforum 790 hosting.
- **2026-11-06** — D11: passkeys + PRF. Considered Sign-in-with-Apple (no key material → breaks E2E), vault passphrase (2 secrets), dropping E2E.
- **2026-11-06** — D10: committed to arch B. Moving to stack/auth/hosting questions.
- **2026-10-30** — D9: IndexedDB cache in from v1.
- **2026-10-30** — Blind index judged weak (no prefix/fuzzy). Pivoted to E2E + client-side index (arch B). Discussed threat model, recovery-code key wrapping. Diagram: /tmp/client-side-index.html.
- **2026-10-30** — Discussed E2E vs at-rest vs search. Clarified: E2E ⊃ at-rest; the real conflict is E2E vs server-side search. Blind index (HMAC tokens) as middle ground. Diagram: /tmp/e2e-diary-storage.html.
- **2026-10-30** — Kickoff. Goal: diary website, approach undecided. Started discovery.
- **2026-10-30** — D5–D8 settled: learn auth/search/encryption; rich text first; one/day; at-rest encryption, E2E TBD.
- **2026-10-30** — D1–D4 settled: me-only now but multi-user ready, browser-first, text-only, learning-driven.
