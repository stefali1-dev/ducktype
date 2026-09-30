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
 * Types one key ("\n" for Enter). A wrong key still advances, except that lines resync on Enter:
 * Enter mid-line skips the rest of the line, and other keys never pass a newline.
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
    const lineEnd = s.code.indexOf("\n", s.pos);
    if (expected === "\n" || (key === "\n" && lineEnd === -1)) {
      // stay put: the newline shows as wrong until Enter; the last line has nothing to skip to
      s.status[s.pos] = "wrong";
      return;
    }
    const to = key === "\n" ? lineEnd + 1 : s.pos + 1;
    while (s.pos < to) s.status[s.pos++] = "wrong";
  }
  while (s.auto[s.pos]) s.status[s.pos++] = "correct";
  if (isDone(s)) s.endedAt = now;
}

export function backspace(s: TypingState): void {
  if (isDone(s)) return;
  // a red newline waiting for Enter: just clear it
  if (s.status[s.pos] === "wrong") {
    s.status[s.pos] = "pending";
    return;
  }
  if (s.pos === 0) return;
  do s.status[--s.pos] = "pending";
  while (s.auto[s.pos]);
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

