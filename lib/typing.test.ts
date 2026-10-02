import { describe, expect, it } from "vitest";
import { backspace, createState, isDone, stats, typeKey } from "./typing";

const typeAll = (s: ReturnType<typeof createState>, keys: string, start = 0, step = 100) =>
  [...keys].forEach((k, i) => typeKey(s, k, start + i * step));

describe("typing engine", () => {
  it("Enter skips the next line's indent", () => {
    const s = createState("if x:\n    y\n");
    typeAll(s, "if x:\n");
    expect(s.pos).toBe(10);
    expect(s.code[s.pos]).toBe("y");
    expect(s.status.slice(6, 10)).toEqual(["correct", "correct", "correct", "correct"]);
  });

  it("one Enter skips blank lines and the indent after them", () => {
    const s = createState("a:\n\n  b");
    typeAll(s, "a:\n");
    expect(s.code[s.pos]).toBe("b");
    backspace(s);
    expect(s.pos).toBe(2);
  });

  it("wrong key advances, backspace un-marks it but keeps the error counted", () => {
    const s = createState("abc");
    typeKey(s, "a", 0);
    typeKey(s, "x", 100);
    expect(s.status[1]).toBe("wrong");
    expect(s.pos).toBe(2);
    backspace(s);
    expect(s.pos).toBe(1);
    expect(s.status[1]).toBe("pending");
    typeAll(s, "bc", 200);
    expect(s.errors).toBe(1);
    expect(s.keystrokes).toBe(4);
    expect(stats(s).accuracy).toBe(75);
  });

  it("backspace jumps back over auto indent to the newline", () => {
    const s = createState("a\n    b");
    typeAll(s, "a\n");
    backspace(s);
    expect(s.pos).toBe(1);
    expect(s.status.slice(1)).toEqual(Array(6).fill("pending"));
  });

  it("WPM counts typed chars only, not the auto indent", () => {
    const code = "abcd:\n        efgh";
    const s = createState(code);
    typeAll(s, "abcd:\nefgh", 0, 6000);
    // 10 typed chars over 9 intervals of 6s = 54s; 10/5 words / 0.9 min = 2.2 wpm
    expect(stats(s)).toEqual({ wpm: 2, accuracy: 100, seconds: 54 });
  });

  it("accuracy only shows 100% for a clean run", () => {
    const s = createState("a".repeat(300));
    typeAll(s, "b" + "a".repeat(299));
    expect(stats(s).accuracy).toBe(99);
  });

  it("net WPM ignores wrong chars", () => {
    const s = createState("aaaaaaaaaa");
    typeAll(s, "aaaaabbbbb", 0, 1000 * 60 / 9);
    expect(stats(s).wpm).toBe(1);
    expect(stats(s).accuracy).toBe(50);
  });

  it("is done after the last char, right or wrong, and timer starts at first key", () => {
    const s = createState("ab");
    typeKey(s, "a", 5000);
    expect(isDone(s)).toBe(false);
    typeKey(s, "x", 7000);
    expect(isDone(s)).toBe(true);
    expect(stats(s).seconds).toBe(2);
    typeKey(s, "b", 9000);
    expect(s.keystrokes).toBe(2);
  });


  it("a non-Enter key on a newline counts an error and waits for Enter", () => {
    const s = createState("ab\n  cd");
    typeAll(s, "abxy");
    expect(s.pos).toBe(2);
    expect(s.status[2]).toBe("wrong");
    expect(s.errors).toBe(2);
    typeKey(s, "\n", 1000);
    expect(s.code[s.pos]).toBe("c");
    expect(s.status[2]).toBe("correct");
  });

  it("backspace on a red newline only clears it", () => {
    const s = createState("ab\n  cd");
    typeAll(s, "abx");
    backspace(s);
    expect(s.pos).toBe(2);
    expect(s.status.slice(0, 3)).toEqual(["correct", "correct", "pending"]);
  });

  it("Enter mid-line counts an error, marks the char and stays put", () => {
    const s = createState("abcd\n    ef");
    typeAll(s, "a\n\n\n");
    expect(s.pos).toBe(1);
    expect(s.status.slice(0, 3)).toEqual(["correct", "wrong", "pending"]);
    expect(s.errors).toBe(3);
    typeAll(s, "bcd\nef", 1000);
    expect(isDone(s)).toBe(true);
    expect(s.status[1]).toBe("correct");
  });

  it("word delete takes spaces, then a run of word chars or of punctuation", () => {
    const s = createState("x = self.name  ;");
    typeAll(s, "x = self.name  ");
    const left = () => s.code.slice(0, s.pos);
    backspace(s, "word");
    expect(left()).toBe("x = self.");
    backspace(s, "word");
    expect(left()).toBe("x = self");
    backspace(s, "word");
    expect(left()).toBe("x = ");
    backspace(s, "word");
    expect(left()).toBe("x ");
    expect(s.status.slice(s.pos)).toEqual(Array(14).fill("pending"));
  });

  it("word and line delete stop at the line start, then act like Backspace", () => {
    const s = createState("ab\n    cd ef\n");
    typeAll(s, "ab\ncd ef");
    backspace(s, "line");
    expect(s.code[s.pos]).toBe("c");
    backspace(s, "word");
    expect(s.pos).toBe(2);
    backspace(s, "word");
    expect(s.pos).toBe(0);
  });

  it("word delete also clears a red char waiting for its key", () => {
    const s = createState("ab cd\n");
    typeAll(s, "ab cd\n".slice(0, 4) + "\n");
    expect(s.status[4]).toBe("wrong");
    backspace(s, "word");
    expect(s.pos).toBe(3);
    expect(s.status[4]).toBe("pending");
  });

  it("Enter on the last line counts an error without moving", () => {
    const s = createState("ab");
    typeAll(s, "a\n");
    expect(s.pos).toBe(1);
    expect(s.errors).toBe(1);
    typeKey(s, "b", 1000);
    expect(isDone(s)).toBe(true);
  });
});
