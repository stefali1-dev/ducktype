import { TABS } from "@/lib/snippets";
import styles from "./FilterBar.module.css";

type Props = { tab: string | null; onChange: (tab: string | null) => void };

/** Buttons keep focus off themselves so typing continues after a click. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

export default function FilterBar({ tab, onChange }: Props) {
  return (
    <nav className={styles.segmented}>
      {[null, ...Object.keys(TABS)].map((t) => (
        <button key={t ?? "all"} aria-pressed={tab === t} onMouseDown={keepFocus} onClick={() => onChange(t)}>
          {t ?? "all"}
        </button>
      ))}
    </nav>
  );
}
