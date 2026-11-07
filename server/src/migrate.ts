import { readdir, readFile } from "node:fs/promises";
import { db } from "./db.js";

const dir = new URL("../migrations/", import.meta.url);

const client = await db.connect();
try {
  await client.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await client.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = await readFile(new URL(name, dir), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [name]);
      await client.query("commit");
      console.log("applied", name);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  console.log("migrations up to date");
} finally {
  client.release();
  await db.end();
}
