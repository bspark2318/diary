import { useEffect, useState } from "react";

export default function App() {
  const [msg, setMsg] = useState("…");
  useEffect(() => {
    fetch("/api/hello").then((r) => r.json()).then((d) => setMsg(`${d.hello} @ ${d.time}`));
  }, []);
  return <h1>server says: {msg}</h1>;
}
