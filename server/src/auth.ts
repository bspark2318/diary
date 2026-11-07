import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes, randomUUID } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { db } from "./db.js";

const rpName = "diary";
const rpID = "localhost";
const origin = "http://localhost:5173";

// --- challenge store: in-memory, keyed by a short-lived cookie. Dev only; lost on restart.
type Pending = { challenge: string; userId?: string; exp: number };
const pending = new Map<string, Pending>();

function savePending(c: Context, p: Omit<Pending, "exp">) {
  const id = randomBytes(16).toString("base64url");
  pending.set(id, { ...p, exp: Date.now() + 5 * 60_000 });
  setCookie(c, "chal", id, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 300 });
}
function takePending(c: Context): Pending | undefined {
  const id = getCookie(c, "chal");
  deleteCookie(c, "chal", { path: "/" });
  if (!id) return;
  const p = pending.get(id);
  pending.delete(id);
  return p && p.exp > Date.now() ? p : undefined;
}

// --- sessions
const SESSION_DAYS = 30;
async function createSession(c: Context, userId: string) {
  const id = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.query("insert into sessions (id, user_id, expires_at) values ($1, $2, $3)", [id, userId, expires]);
  setCookie(c, "sid", id, { httpOnly: true, sameSite: "Lax", path: "/", expires });
}
export async function currentUser(c: Context): Promise<{ userId: string; role: string } | null> {
  const sid = getCookie(c, "sid");
  if (!sid) return null;
  const { rows } = await db.query<{ user_id: string; role: string }>(
    "select u.id as user_id, u.role from sessions s join users u on u.id = s.user_id where s.id = $1 and s.expires_at > now()", [sid]);
  return rows[0] ? { userId: rows[0].user_id, role: rows[0].role } : null;
}

export const auth = new Hono();

// ---------- register ----------
auth.post("/register/options", async (c) => {
  // D28: signup closes after the first user (who is admin). Invites later.
  if ((await db.query("select 1 from users limit 1")).rowCount) return c.json({ error: "signup closed" }, 403);
  const userId = randomUUID();
  const options = await generateRegistrationOptions({
    rpName, rpID,
    userID: new TextEncoder().encode(userId),
    userName: `diary-${userId.slice(0, 8)}`,
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    extensions: { prf: {} } as any, // Session 4 will evaluate PRF; enabling it at creation is required
  });
  savePending(c, { challenge: options.challenge, userId });
  return c.json(options);
});

auth.post("/register/verify", async (c) => {
  const p = takePending(c);
  if (!p?.userId) return c.json({ error: "no pending registration" }, 400);
  const response = await c.req.json();
  // D23: no PRF → no way to ever unwrap K → refuse to create the account.
  if (response.clientExtensionResults?.prf?.enabled !== true) return c.json({ error: "PRF not supported" }, 400);
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: p.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!verified || !registrationInfo) return c.json({ error: "not verified" }, 400);

  const { credential } = registrationInfo;
  // first user bootstraps as admin (D19)
  await db.query(
    "insert into users (id, role) values ($1, case when exists (select 1 from users) then 'user' else 'admin' end)",
    [p.userId]);
  await db.query(
    "insert into passkeys (id, user_id, public_key, counter, transports) values ($1, $2, $3, $4, $5)",
    [credential.id, p.userId, Buffer.from(credential.publicKey), credential.counter, credential.transports ?? []],
  );
  await createSession(c, p.userId);
  return c.json({ userId: p.userId, credentialId: credential.id });
});

// ---------- login ----------
auth.post("/login/options", async (c) => {
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  savePending(c, { challenge: options.challenge });
  return c.json(options);
});

auth.post("/login/verify", async (c) => {
  const p = takePending(c);
  if (!p) return c.json({ error: "no pending login" }, 400);
  const response = await c.req.json();
  const { rows } = await db.query<{
    user_id: string; public_key: Buffer; counter: string; transports: string[];
    wrapped_k: Buffer | null; salt: Buffer | null; role: string; has_recovery: boolean;
  }>(
    `select p.user_id, p.public_key, p.counter, p.transports, p.wrapped_k, p.salt, u.role,
            (u.recovery_wrapped_k is not null) as has_recovery
       from passkeys p join users u on u.id = p.user_id where p.id = $1`, [response.id]);
  const pk = rows[0];
  if (!pk) return c.json({ error: "unknown passkey" }, 400);

  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge: p.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { id: response.id, publicKey: new Uint8Array(pk.public_key), counter: Number(pk.counter), transports: pk.transports as any },
  });
  if (!verified) return c.json({ error: "not verified" }, 400);

  await db.query("update passkeys set counter = $1 where id = $2", [authenticationInfo.newCounter, response.id]);
  await createSession(c, pk.user_id);
  // Hand back this passkey's K wrap so the client can unwrap with the PRF output it just received.
  return c.json({
    userId: pk.user_id, role: pk.role, credentialId: response.id,
    wrappedK: pk.wrapped_k?.toString("base64url") ?? null, salt: pk.salt?.toString("base64url") ?? null,
    hasRecovery: pk.has_recovery,
  });
});

// ---------- session ----------
auth.post("/logout", async (c) => {
  const sid = getCookie(c, "sid");
  if (sid) await db.query("delete from sessions where id = $1", [sid]);
  deleteCookie(c, "sid", { path: "/" });
  return c.json({ ok: true });
});
