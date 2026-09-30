import type { Metadata } from "next";
import Link from "next/link";
import { snippets, sources } from "@/lib/snippets";
import styles from "./credits.module.css";

export const metadata: Metadata = { title: "credits · ducktype" };

export default function Credits() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        ← ducktype
      </Link>
      <h1>Credits</h1>
      <p>
        Every snippet is real code from these open source projects, pinned to one commit. Each
        exercise links to its exact lines on GitHub.
      </p>
      <ul className={styles.list}>
        {sources.map((s) => (
          <li key={s.id}>
            <div>
              <a href={`https://github.com/${s.repo}`}>{s.repo}</a>
              <span className={styles.id}>{s.id}</span>
            </div>
            <div className={styles.meta}>
              {s.license} ·{" "}
              <a href={`https://github.com/${s.repo}/tree/${s.sha}`}>{s.sha.slice(0, 7)}</a> ·{" "}
              {snippets.filter((x) => x.repo === s.id).length} snippets
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
