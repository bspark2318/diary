import { useEffect, useState, useSyncExternalStore } from "react";
import { getK, onKeyChange } from "./crypto/key";
import { register, login, logout } from "./crypto/auth";
import Diary from "./entries/Diary";

type Me = { userId: string; role: string };

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const k = useSyncExternalStore(onKeyChange, getK); // null = locked (K is memory-only; gone on reload)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const refresh = () => fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe);
  useEffect(() => { refresh(); }, []);

  async function run(fn: () => Promise<{ recoveryCode?: string } | void>) {
    setErr("");
    try {
      const r = await fn();
      if (r?.recoveryCode) setRecoveryCode(r.recoveryCode);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (recoveryCode) return (
    <main>
      <h2>Your recovery code</h2>
      <p>Shown <b>once</b>. Store it somewhere safe. Lose every passkey and this code, and the diary is unrecoverable.</p>
      <pre style={{ fontSize: 20, userSelect: "all" }}>{recoveryCode}</pre>
      <button onClick={() => setRecoveryCode(null)}>I saved it</button>
    </main>
  );

  if (me) return (
    <main>
      <p>signed in as <code>{me.userId}</code> ({me.role}) — {k ? "unlocked" : "locked"}</p>
      {!k && <button onClick={() => run(login)}>Unlock</button>}{" "}
      <button onClick={() => run(logout)}>Logout</button>
      {k && <Diary />}
      {err && <p style={{ color: "crimson" }}>{err}</p>}
    </main>
  );

  return (
    <main>
      <button onClick={() => run(register)}>Create account</button>{" "}
      <button onClick={() => run(login)}>Sign in</button>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
    </main>
  );
}
