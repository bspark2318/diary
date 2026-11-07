import { useEffect, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const refresh = () => fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => setUserId(d?.userId ?? null));
  useEffect(() => { refresh(); }, []);

  async function run(kind: "register" | "login") {
    setErr("");
    try {
      const optionsJSON = await post(`/api/auth/${kind}/options`);
      const response = kind === "register" ? await startRegistration({ optionsJSON }) : await startAuthentication({ optionsJSON });
      const res = await post(`/api/auth/${kind}/verify`, response);
      if (res.error) throw new Error(res.error);
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  }

  if (userId) return (
    <main>
      <p>signed in as <code>{userId}</code></p>
      <button onClick={() => post("/api/auth/logout").then(refresh)}>Logout</button>
    </main>
  );
  return (
    <main>
      <button onClick={() => run("register")}>Create account</button>{" "}
      <button onClick={() => run("login")}>Sign in</button>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
    </main>
  );
}
