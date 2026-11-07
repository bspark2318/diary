import { useEffect, useState } from "react";
import Editor from "../editor/Editor";
import { listEntries, localDate } from "./api";
import { sync } from "./cache";
import SearchBox from "../search/SearchBox";
import { buildIndex, indexDay } from "../search/index";

// Sidebar of dates (newest first, today pinned) + editor for the selected day (D31).
export default function Diary({ onLogout }: { onLogout: () => void }) {
  const today = localDate();
  const [dates, setDates] = useState<string[]>([]);
  const [selected, setSelected] = useState(today);
  const [searching, setSearching] = useState(false);

  const refresh = () => listEntries().then((rows) => setDates(rows.map((r) => r.date).sort().reverse()));
  useEffect(() => {
    refresh(); buildIndex();   // index built once per unlock (D33)
    // Tab back in view → pull other devices' writes (D34); only touch the list + index if something changed.
    const onVisible = () => { if (document.visibilityState === "visible") sync().then((n) => { if (n) { refresh(); buildIndex(); } }); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const list = dates.includes(today) ? dates : [today, ...dates];
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">Diary</div>
        <SearchBox onPick={setSelected} onQuery={setSearching} />
        {!searching && <>
          <div className="sec">Entries</div>
          {list.map((d) => (
            <div key={d} onClick={() => setSelected(d)}
                 className={"day" + (d === selected ? " on" : "") + (dates.includes(d) ? "" : " empty")}>
              <span>{d}</span>{d === today && <span className="tag">today</span>}
            </div>
          ))}
        </>}
        <div className="foot"><span>unlocked</span><button onClick={onLogout}>Log out</button></div>
      </aside>
      <Editor date={selected} onSaved={(d, doc) => { indexDay(d, doc); if (!dates.includes(d)) refresh(); }} />
    </div>
  );
}
