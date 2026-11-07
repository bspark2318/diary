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
- **D4 — Motivation**: (a) learn system design hands-on, (b) tool tailored to my own habits, (c) possibly open to public later.

## Open Questions
- Admin: exact powers? invite-only signup vs open? admin UI vs CLI?
- Multi-user "day one": full auth now, or single-user with clean seams for later?
- Passkey fallback for browsers without PRF? (block, or passphrase fallback)
- WebAuthn server library (e.g. SimpleWebAuthn) vs fully hand-rolled?
- Domain name + HTTPS method (Cloudflare Tunnel vs Caddy + port-forward)?
- Minisforum not yet set up (as of 2026-11-06). OS, SSH, Docker vs systemd all TBD. Dev locally until then.
- Rich text storage format: HTML, Markdown, or editor JSON (e.g. TipTap/ProseMirror)?
- Timezone rule for "one per day"?
- Must-haves vs nice-to-haves?

## Ideas / Parking Lot
- **Candidate arch (E2E + blind index)**: one Postgres DB. `entries(user_id, date, ciphertext, nonce)` forward store; `entry_tokens(user_id, token_hash, date)` blind index where `token_hash = HMAC(K, word)`. Key `K` derived client-side from password; server never holds plaintext or key. No Elasticsearch (needs plaintext). Tradeoffs: exact-word only, leaks word-frequency patterns, lost password = lost data.
- **Candidate arch B (E2E + client-side index)** — current favorite: server = auth + encrypted blob store `entries(user_id, date, ciphertext, nonce, updated_at)`. Browser decrypts all entries, builds MiniSearch/FlexSearch index, caches encrypted in IndexedDB, syncs incrementally via `updated_at`. Full prefix/fuzzy/rank. ~7 MB for 10 yrs. Password recovery via random master key K wrapped by password + printed recovery code.
- Alternative: at-rest encryption + server-side search (Postgres FTS or Elasticsearch). Simpler, server can read entries.

## Log
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
