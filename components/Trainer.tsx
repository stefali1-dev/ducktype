"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { snippets, TABS, type Snippet } from "@/lib/snippets";
import { stats, type TypingState } from "@/lib/typing";
import FilterBar from "./FilterBar";
import Results, { type Result } from "./Results";
import TypingArea from "./TypingArea";
import styles from "./Trainer.module.css";

type Phase = "idle" | "typing" | "done";

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function pick(tab: string | null, current?: Snippet): Snippet {
  let pool = snippets.filter((s) => !tab || TABS[tab]?.includes(s.category));
  // a tab saved by an older build can match nothing
  if (!pool.length) pool = snippets;
  if (pool.length > 1) pool = pool.filter((s) => s !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function Trainer() {
  const [tab, setTab] = useState(() => load<string | null>("ducktype:tab", null));
  const [snippet, setSnippet] = useState(() => pick(tab));
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const start = (next: Snippet) => {
    setSnippet(next);
    setRun((r) => r + 1);
    setPhase("idle");
    setResult(null);
  };
  const restart = () => start(snippet);
  const next = () => start(pick(tab, snippet));
  const changeTab = (t: string | null) => {
    setTab(t);
    save("ducktype:tab", t);
    start(pick(t, snippet));
  };

  const onStart = useCallback(() => setPhase("typing"), []);
  const onDone = useCallback(
    (s: TypingState) => {
      const st = stats(s);
      const bests = load<Record<string, number>>("ducktype:best", {});
      const prev = bests[snippet.id] ?? null;
      if (prev === null || st.wpm > prev) {
        save("ducktype:best", { ...bests, [snippet.id]: st.wpm });
      }
      setResult({
        ...st,
        best: Math.max(prev ?? 0, st.wpm),
        newBest: prev !== null && st.wpm > prev,
      });
      setPhase("done");
    },
    [snippet],
  );

  useEffect(() => {
    const root = rootRef.current!;
    const onKey = (e: KeyboardEvent) => {
      delete root.dataset.mouse;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Tab") restart();
      else if (e.key === "Escape") next();
      else if (phase === "done" && e.key === "Enter") next();
      else return;
      // the new exercise mounts before this key's input event, which would type into it
      e.preventDefault();
    };
    const onMouse = () => (root.dataset.mouse = "");
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousemove", onMouse);
    };
  });

  return (
    <div className={styles.root} data-phase={phase} ref={rootRef}>
      <header className={styles.top}>
        <span className={styles.wordmark}>
          <Image src="/duck.svg" alt="" width={18} height={18} />
          ducktype
        </span>
        <FilterBar tab={tab} onChange={changeTab} />
      </header>

      <main className={styles.main}>
        <TypingArea key={run} code={snippet.code} onStart={onStart} onDone={onDone} />
        <p className={styles.caption}>
          <a href={snippet.url} target="_blank" rel="noreferrer">
            {snippet.repo} · {snippet.path}:{snippet.line}
          </a>
        </p>
        <div className={styles.results}>
          {result && (
            <Results result={result} onNext={next} onRetry={restart} />
          )}
        </div>
      </main>

      <footer className={styles.footer}>
        <span>
          <kbd>tab</kbd> restart <kbd>esc</kbd> next
        </span>
        <Link href="/credits">credits</Link>
      </footer>
    </div>
  );
}
