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
    <main className="screen"><div className="card">
      <h1>Your recovery code</h1>
      <p className="lead">Shown <b>once</b>. Store it somewhere safe. Lose every passkey and this code, and the diary is unrecoverable.</p>
      <pre className="code">{recoveryCode}</pre>
      <button className="btn primary" onClick={() => setRecoveryCode(null)}>I saved it</button>
    </div></main>
  );

  if (me && k) return <Diary onLogout={() => run(logout)} />;

  if (me) return (
    <main className="screen"><div className="card">
      <h1>Locked</h1>
      <p className="lead">Your entries are encrypted. Unlock with your passkey to read and write.</p>
      <div className="row">
        <button className="btn primary" onClick={() => run(login)}>Unlock</button>
        <button className="btn" onClick={() => run(logout)}>Log out</button>
      </div>
      {err && <p className="err">{err}</p>}
    </div></main>
  );

  return (
    <main className="screen"><div className="card">
      <h1>Diary</h1>
      <p className="lead">One page a day. Encrypted before it leaves your device. No password — just your passkey.</p>
      <div className="row">
        <button className="btn primary" onClick={() => run(login)}>Sign in</button>
        <button className="btn" onClick={() => run(register)}>Create account</button>
      </div>
      {err && <p className="err">{err}</p>}
    </div></main>
  );
}
