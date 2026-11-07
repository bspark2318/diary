import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/api/hello", (c) => c.json({ hello: "diary", time: new Date().toISOString() }));

serve({ fetch: app.fetch, port: 3000 }, () => console.log("server → http://localhost:3000"));
