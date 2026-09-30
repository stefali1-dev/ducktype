import type { Stats } from "@/lib/typing";
import styles from "./Results.module.css";

export type Result = Stats & { best: number; newBest: boolean };

type Props = { result: Result; onNext: () => void; onRetry: () => void };

export default function Results({ result, onNext, onRetry }: Props) {
  return (
    <div className={styles.results}>
      <dl className={styles.stats}>
        <div className={styles.wpm}>
          <dt>wpm</dt>
          <dd>{result.wpm}</dd>
        </div>
        <div>
          <dt>accuracy</dt>
          <dd>{result.accuracy}%</dd>
        </div>
        <div>
          <dt>time</dt>
          <dd>{result.seconds}s</dd>
        </div>
        <div>
          <dt>{result.newBest ? "new best" : "best"}</dt>
          <dd className={result.newBest ? styles.newBest : undefined}>{result.best}</dd>
        </div>
      </dl>
      <div className={styles.actions}>
        <button onClick={onNext}>
          next <kbd>enter</kbd>
        </button>
        <button onClick={onRetry}>
          retry <kbd>tab</kbd>
        </button>
      </div>
    </div>
  );
}
