import { Hono } from "hono";
import { db } from "./db.js";
import { currentUser } from "./auth.js";

// Server stores opaque bytes only. Client encrypts with K before PUT, decrypts after GET.
export const entries = new Hono();

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const b64 = (b: Buffer) => b.toString("base64");

entries.use("*", async (c, next) => {
  const me = await currentUser(c);
  if (!me) return c.json({ error: "unauthenticated" }, 401);
  c.set("userId" as never, me.userId as never);
  await next();
});

// GET /api/entries?since=<ISO>  → all (or changed-since) entries for sync
entries.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const since = c.req.query("since");
  const { rows } = await db.query(
    `select date::text, ciphertext, nonce, updated_at from entries
     where user_id = $1 and ($2::timestamptz is null or updated_at >= $2)
     order by date`,
    [userId, since ?? null],
  );
  return c.json(rows.map((r) => ({ date: r.date, ciphertext: b64(r.ciphertext), nonce: b64(r.nonce), updatedAt: r.updated_at })));
});

entries.get("/:date", async (c) => {
  const userId = c.get("userId" as never) as string;
  const date = c.req.param("date");
  if (!DATE.test(date)) return c.json({ error: "bad date" }, 400);
  const { rows } = await db.query("select ciphertext, nonce, updated_at from entries where user_id = $1 and date = $2", [userId, date]);
  const r = rows[0];
  if (!r) return c.json({ error: "not found" }, 404);
  return c.json({ date, ciphertext: b64(r.ciphertext), nonce: b64(r.nonce), updatedAt: r.updated_at });
});

// PUT /api/entries/:date  { ciphertext, nonce: base64, baseUpdatedAt: ISO | null }  → upsert
// Optimistic lock (D32): baseUpdatedAt must equal the row's current updated_at (null = "I think it's new").
entries.put("/:date", async (c) => {
  const userId = c.get("userId" as never) as string;
  const date = c.req.param("date");
  if (!DATE.test(date)) return c.json({ error: "bad date" }, 400);
  const body = await c.req.json<{ ciphertext?: string; nonce?: string; baseUpdatedAt?: string | null }>();
  if (!body.ciphertext || !body.nonce) return c.json({ error: "ciphertext and nonce required" }, 400);

  const client = await db.connect();
  try {
    await client.query("begin");
    const cur = await client.query("select updated_at from entries where user_id = $1 and date = $2 for update", [userId, date]);
    const current: Date | null = cur.rows[0]?.updated_at ?? null;
    const base = body.baseUpdatedAt ? new Date(body.baseUpdatedAt) : null;
    if ((current?.getTime() ?? null) !== (base?.getTime() ?? null)) {
      await client.query("rollback");
      return c.json({ error: "conflict", updatedAt: current }, 409);
    }
    const { rows } = await client.query(
      `insert into entries (user_id, date, ciphertext, nonce)
       values ($1, $2, $3, $4)
       on conflict (user_id, date) do update set ciphertext = excluded.ciphertext, nonce = excluded.nonce, updated_at = now()
       returning updated_at`,
      [userId, date, Buffer.from(body.ciphertext, "base64"), Buffer.from(body.nonce, "base64")],
    );
    await client.query("commit");
    return c.json({ date, updatedAt: rows[0].updated_at });
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
});
