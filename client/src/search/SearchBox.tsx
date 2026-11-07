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
      <input value={q} onChange={(e) => change(e.target.value)} placeholder="Search" />
      {q.trim() !== "" && (
        <div>
          <div className="sec">Results</div>
          {hits.length === 0 && <div className="none">No matches</div>}
          {hits.map((h) => (
            <div key={h.date} onClick={() => onPick(h.date)} className="hit">
              <div>{h.date}</div>
              <div className="snip">{h.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
