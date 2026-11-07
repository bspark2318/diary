import { Hono } from "hono";
import { db } from "./db.js";
import { currentUser } from "./auth.js";

// Decode base64url and insist on the exact length (D26: wrapped_k = nonce12‖ct48 = 60, salt = 16).
const bytes = (s: unknown, len: number) => {
  const b = typeof s === "string" ? Buffer.from(s, "base64url") : null;
  return b && b.length === len ? b : null;
};

export const keys = new Hono<{ Variables: { userId: string } }>();

keys.use(async (c, next) => {
  const me = await currentUser(c);
  if (!me) return c.json({ error: "unauthenticated" }, 401);
  c.set("userId", me.userId);
  await next();
});

// K wrapped by this passkey's PRF output. Only the owning user may set it.
keys.put("/prf", async (c) => {
  const { credentialId, wrappedK, salt } = await c.req.json();
  const w = bytes(wrappedK, 60), s = bytes(salt, 16);
  if (!w || !s || typeof credentialId !== "string") return c.json({ error: "bad wrap" }, 400);
  const { rowCount } = await db.query(
    "update passkeys set wrapped_k = $1, salt = $2 where id = $3 and user_id = $4", [w, s, credentialId, c.get("userId")]);
  return rowCount ? c.json({ ok: true }) : c.json({ error: "unknown passkey" }, 404);
});

// K wrapped by the recovery code (PBKDF2).
keys.put("/recovery", async (c) => {
  const { wrappedK, salt } = await c.req.json();
  const w = bytes(wrappedK, 60), s = bytes(salt, 16);
  if (!w || !s) return c.json({ error: "bad wrap" }, 400);
  await db.query("update users set recovery_wrapped_k = $1, recovery_salt = $2 where id = $3", [w, s, c.get("userId")]);
  return c.json({ ok: true });
});
