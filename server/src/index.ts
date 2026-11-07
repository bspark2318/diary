import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth, currentUserId } from "./auth.js";

const app = new Hono();

app.get("/api/hello", (c) => c.json({ hello: "diary", time: new Date().toISOString() }));
app.route("/api/auth", auth);
app.get("/api/me", async (c) => {
  const userId = await currentUserId(c);
  return userId ? c.json({ userId }) : c.json({ error: "unauthenticated" }, 401);
});

serve({ fetch: app.fetch, port: 3000 }, () => console.log("server → http://localhost:3000"));
