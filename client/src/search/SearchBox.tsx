import { useState } from "react";
import { search, type Hit } from "./index";

type Props = { onPick: (date: string) => void; onQuery: (active: boolean) => void };

// Search box + results. Results replace the sidebar date list while the query is non-empty (D33).
export default function SearchBox({ onPick, onQuery }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  function change(v: string) {
    setQ(v);
    setHits(search(v));
    onQuery(v.trim() !== "");
  }

  return (
    <div>
      <input value={q} onChange={(e) => change(e.target.value)} placeholder="search" style={{ width: "100%", boxSizing: "border-box", marginBottom: 8 }} />
      {q.trim() !== "" && (
        <div>
          {hits.length === 0 && <div style={{ opacity: 0.5, padding: "4px 8px" }}>no matches</div>}
          {hits.map((h) => (
            <div key={h.date} onClick={() => onPick(h.date)} style={{ cursor: "pointer", padding: "4px 8px" }}>
              <div style={{ fontWeight: 600 }}>{h.date}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{h.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
