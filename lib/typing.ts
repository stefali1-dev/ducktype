export type Status = "pending" | "correct" | "wrong";

export type TypingState = {
  code: string;
  /** Indents and blank lines: filled in automatically, never typed. */
  auto: boolean[];
  pos: number;
  status: Status[];
  startedAt: number | null;
  endedAt: number | null;
  keystrokes: number;
  errors: number;
};

export function createState(code: string): TypingState {
  const auto: boolean[] = [];
  let lineStart = true;
  for (const ch of code) {
    // a newline at a line's start is a blank line
    auto.push(lineStart && (ch === " " || ch === "\n"));
    lineStart = ch === "\n" || (lineStart && ch === " ");
  }
  return {
    code,
    auto,
    pos: 0,
    status: Array(code.length).fill("pending"),
    startedAt: null,
    endedAt: null,
    keystrokes: 0,
    errors: 0,
  };
}

export function isDone(s: TypingState): boolean {
  return s.pos === s.code.length;
}

/**
 * Types one key ("\n" for Enter). A wrong key still advances, except that Enter and newlines
 * only meet each other: Enter mid-line and other keys at a newline stay put, so a slip stays on its line.
 */
export function typeKey(s: TypingState, key: string, now: number): void {
  if (isDone(s)) return;
  s.startedAt ??= now;
  s.keystrokes++;
  const expected = s.code[s.pos];
  if (key === expected) {
    s.status[s.pos++] = "correct";
  } else {
    s.errors++;
    if (expected === "\n" || key === "\n") {
      // stay put: the char shows as wrong until its own key
      s.status[s.pos] = "wrong";
      return;
    }
    s.status[s.pos++] = "wrong";
  }
  while (s.auto[s.pos]) s.status[s.pos++] = "correct";
  if (isDone(s)) s.endedAt = now;
}

export type Unit = "char" | "word" | "line";

/** Backspace; "word" is Ctrl/Option+Backspace and "line" is Cmd+Backspace, as in a code editor. */
export function backspace(s: TypingState, unit: Unit = "char"): void {
  if (isDone(s)) return;
  // a red char waiting for its key: a plain backspace just clears it
  if (s.status[s.pos] === "wrong") {
    s.status[s.pos] = "pending";
    if (unit === "char") return;
  }
  const inLine = (i: number) => i >= 0 && !s.auto[i] && s.code[i] !== "\n";
  let to = s.pos;
  if (unit === "char" || !inLine(to - 1)) {
    // one char; at a line start that's the newline, with the indent after it
    if (to === 0) return;
    do to--;
    while (s.auto[to]);
  } else if (unit === "line") {
    while (inLine(to - 1)) to--;
  } else {
    // spaces, then one run of word chars or one run of punctuation
    while (inLine(to - 1) && s.code[to - 1] === " ") to--;
    const word = /\w/.test(s.code[to - 1]);
    while (inLine(to - 1) && s.code[to - 1] !== " " && /\w/.test(s.code[to - 1]) === word) to--;
  }
  while (s.pos > to) s.status[--s.pos] = "pending";
}

export type Stats = { wpm: number; accuracy: number; seconds: number };

export function stats(s: TypingState): Stats {
  const ms = (s.endedAt ?? 0) - (s.startedAt ?? 0);
  let correct = 0;
  for (let i = 0; i < s.code.length; i++) {
    if (!s.auto[i] && s.status[i] === "correct") correct++;
  }
  return {
    wpm: ms > 0 ? Math.round(correct / 5 / (ms / 60000)) : 0,
    // floor: any mistake keeps you under 100%
    accuracy: s.keystrokes ? Math.floor((100 * (s.keystrokes - s.errors)) / s.keystrokes) : 100,
    seconds: Math.round(ms / 100) / 10,
  };
}

