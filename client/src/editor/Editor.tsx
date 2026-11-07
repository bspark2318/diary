import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { seal, open } from "../entries/seal";
import { Conflict, getEntry, putEntry } from "../entries/api";

type Props = { date: string; onSaved: (date: string) => void };

// One day's entry. Loads + decrypts on date change; autosaves 1 s after last keystroke (D30);
// sends baseUpdatedAt for optimistic locking (D32).
export default function Editor({ date, onSaved }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "conflict" | "error">("loading");
  const base = useRef<string | null>(null);      // updatedAt of the version we loaded
  const timer = useRef<number | undefined>(undefined);
  const loadedDate = useRef<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    onUpdate: ({ editor }) => {
      if (loadedDate.current !== date) return;     // ignore programmatic setContent during load
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => save(editor.getJSON()), 1000);
    },
  });

  async function save(doc: unknown) {
    setStatus("saving");
    try {
      const { updatedAt } = await putEntry(date, await seal(doc), base.current);
      base.current = updatedAt;
      setStatus("saved");
      onSaved(date);
    } catch (e) {
      setStatus(e instanceof Conflict ? "conflict" : "error");
    }
  }

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    loadedDate.current = null;
    setStatus("loading");
    (async () => {
      const row = await getEntry(date);
      if (cancelled) return;
      base.current = row?.updatedAt ?? null;
      editor.commands.setContent(row ? ((await open(row.ciphertext, row.nonce)) as never) : "");
      loadedDate.current = date;
      setStatus("ready");
    })().catch(() => setStatus("error"));
    return () => { cancelled = true; window.clearTimeout(timer.current); };
  }, [editor, date]);

  return (
    <section style={{ flex: 1 }}>
      <header style={{ display: "flex", justifyContent: "space-between", color: "#888", fontSize: 13 }}>
        <span>{date}</span>
        <span>{status === "conflict" ? "changed elsewhere — reload" : status}</span>
      </header>
      <EditorContent editor={editor} />
    </section>
  );
}
