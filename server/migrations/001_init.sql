create table users (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

-- one row per registered passkey (a user may have several devices)
create table passkeys (
  id          text primary key,            -- credential ID (base64url) from the authenticator
  user_id     uuid not null references users(id) on delete cascade,
  public_key  bytea not null,
  counter     bigint not null default 0,   -- signature counter, detects cloned authenticators
  transports  text[] not null default '{}',
  created_at  timestamptz not null default now()
);

-- master key K, wrapped (encrypted) by a secret only the client has
create table key_wraps (
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('prf', 'recovery')),
  wrapped_k   bytea not null,
  salt        bytea not null,
  primary key (user_id, kind)
);

create table sessions (
  id          text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null
);

-- one encrypted entry per user per day; server never sees plaintext
create table entries (
  user_id     uuid not null references users(id) on delete cascade,
  date        date not null,
  ciphertext  bytea not null,
  nonce       bytea not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, date)
);

create index entries_user_updated on entries (user_id, updated_at);
