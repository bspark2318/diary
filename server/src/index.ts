import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth, currentUser } from "./auth.js";
import { keys } from "./keys.js";
import { entries } from "./entries.js";

const app = new Hono();

app.get("/api/hello", (c) => c.json({ hello: "diary", time: new Date().toISOString() }));
app.route("/api/auth", auth);
app.route("/api/keys", keys);
app.route("/api/entries", entries);
app.get("/api/me", async (c) => {
  const me = await currentUser(c);
  return me ? c.json(me) : c.json({ error: "unauthenticated" }, 401);
});

serve({ fetch: app.fetch, port: 3000 }, () => console.log("server → http://localhost:3000"));
