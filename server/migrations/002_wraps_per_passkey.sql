-- PRF output is per-passkey, so K must be wrapped once per passkey, not once per user.
drop table key_wraps;

-- null until the first PRF evaluation (browsers return PRF output on get(), not create())
alter table passkeys
  add column wrapped_k bytea,
  add column salt      bytea;

alter table users
  add column recovery_wrapped_k bytea,
  add column recovery_salt      bytea,
  add column role text not null default 'user' check (role in ('user', 'admin'));
