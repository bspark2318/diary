import { useEffect, useState } from "react";
import Editor from "../editor/Editor";
import { listEntries, localDate } from "./api";
import SearchBox from "../search/SearchBox";
import { buildIndex, indexDay } from "../search/index";

// Sidebar of dates (newest first, today pinned) + editor for the selected day (D31).
export default function Diary() {
  const today = localDate();
  const [dates, setDates] = useState<string[]>([]);
  const [selected, setSelected] = useState(today);
  const [searching, setSearching] = useState(false);

  const refresh = () => listEntries().then((rows) => setDates(rows.map((r) => r.date).sort().reverse()));
  useEffect(() => { refresh(); buildIndex(); }, []);   // index built once per unlock (D33)

  const list = dates.includes(today) ? dates : [today, ...dates];
  return (
    <div style={{ display: "flex", gap: 24 }}>
      <nav style={{ width: 200 }}>
        <SearchBox onPick={setSelected} onQuery={setSearching} />
        {!searching && list.map((d) => (
          <div key={d} onClick={() => setSelected(d)}
               style={{ cursor: "pointer", padding: "4px 8px", fontWeight: d === selected ? 700 : 400, opacity: dates.includes(d) ? 1 : 0.5 }}>
            {d}{d === today ? " · today" : ""}
          </div>
        ))}
      </nav>
      <Editor date={selected} onSaved={(d, doc) => { indexDay(d, doc); if (!dates.includes(d)) refresh(); }} />
    </div>
  );
}
