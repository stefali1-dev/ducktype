"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { backspace, createState, isDone, typeKey, type Status, type TypingState } from "@/lib/typing";
import styles from "./TypingArea.module.css";

const STATUS: Record<Status, string> = { pending: "", correct: styles.correct, wrong: styles.wrong };

const kind = (ch: string) => (ch === " " ? styles.space : ch === "\n" ? styles.newline : "");

type Props = { code: string; onStart: () => void; onDone: (s: TypingState) => void };

const OMEGA = 45; // caret spring stiffness: settles in ~90 ms

/** One frame of a critically damped spring: new offset from the target and new velocity. */
function spring(offset: number, v: number, dt: number): [number, number] {
  const decay = Math.exp(-OMEGA * dt);
  const k = (v + OMEGA * offset) * dt;
  return [(offset + k) * decay, (v - OMEGA * k) * decay];
}

/**
 * Keystrokes never re-render: typing state lives outside React and only the changed spans'
 * classes and the caret/scroll transforms are touched.
 */
export default function TypingArea({ code, onStart, onDone }: Props) {
  const [s] = useState(() => createState(code));
  const viewRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chars = useMemo(
    () => [...code].map((ch, i) => <span key={i} className={kind(ch)}>{ch}</span>),
    [code],
  );

  useEffect(() => {
    const view = viewRef.current!;
    const layer = layerRef.current!;
    const caret = caretRef.current!;
    const input = inputRef.current!;
    const spans = charsRef.current!.children as HTMLCollectionOf<HTMLElement>;

    // The caret rides a spring toward its target. Unlike a CSS transition, a new target
    // mid-glide keeps the current velocity instead of restarting the curve, so fast typing stays fluid.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const c = { tx: 0, ty: 0, dx: 0, dy: 0, vx: 0, vy: 0, t: 0, frame: 0 };
    const draw = () => (caret.style.transform = `translate(${c.tx + c.dx}px, ${c.ty + c.dy}px)`);
    const glide = (now: number) => {
      const dt = Math.min((now - c.t) / 1000, 1 / 30);
      c.t = now;
      [c.dx, c.vx] = spring(c.dx, c.vx, dt);
      [c.dy, c.vy] = spring(c.dy, c.vy, dt);
      const moving = Math.abs(c.dx) + Math.abs(c.dy) > 0.1 || Math.abs(c.vx) + Math.abs(c.vy) > 1;
      if (!moving) c.dx = c.dy = c.vx = c.vy = 0;
      draw();
      c.frame = moving ? requestAnimationFrame(glide) : 0;
    };

    const moveCaret = (animate: boolean) => {
      const lineHeight = parseFloat(getComputedStyle(layer).lineHeight);
      const at = spans[Math.min(s.pos, spans.length - 1)];
      if (animate && !reduced) {
        c.dx += c.tx - at.offsetLeft;
        c.dy += c.ty - at.offsetTop;
        if (!c.frame) {
          c.t = performance.now();
          c.frame = requestAnimationFrame(glide);
        }
      } else {
        c.dx = c.dy = c.vx = c.vy = 0;
      }
      c.tx = at.offsetLeft;
      c.ty = at.offsetTop;
      if (!c.frame) draw();
      // scroll by whole lines, keeping two lines of context above the caret
      const line = Math.floor(at.offsetTop / lineHeight);
      const max = Math.max(0, layer.offsetHeight - view.clientHeight);
      const scroll = Math.min(max, Math.max(0, (line - 2) * lineHeight));
      const transform = `translateY(${-scroll}px)`;
      if (layer.style.transform !== transform) layer.style.transform = transform;
      const more = String(scroll < max);
      if (view.dataset.more !== more) view.dataset.more = more;
    };

    const handle = (key: string | null) => {
      const before = s.pos;
      if (key === null) backspace(s);
      else typeKey(s, key, performance.now());
      // inclusive: a key that doesn't advance still marks the current char
      const last = Math.min(Math.max(before, s.pos), code.length - 1);
      for (let i = Math.min(before, s.pos); i <= last; i++) {
        spans[i].className = `${kind(code[i])} ${STATUS[s.status[i]]}`;
      }
      moveCaret(true);
      if (key !== null && s.keystrokes === 1) onStart();
      if (isDone(s)) onDone(s);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isDone(s) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Backspace") handle(null);
      else if (e.key === "Enter") handle("\n");
      else return;
      e.preventDefault();
    };

    const onBeforeInput = (e: InputEvent) => {
      e.preventDefault();
      if (e.inputType === "insertText" && e.data) {
        for (const ch of e.data) if (!isDone(s)) handle(ch);
      } else if (e.inputType === "deleteContentBackward" && !isDone(s)) {
        handle(null);
      }
    };

    const focus = (e: Event) => {
      const target = e.target as Element;
      // a focused link keeps Enter; any other key comes back to typing
      const onLink = (e.type === "click" || (e as KeyboardEvent).key === "Enter") && target.closest("a");
      if (target !== input && !onLink) input.focus({ preventScroll: true });
    };

    const snap = () => moveCaret(false);
    snap();
    // the web font can land after mount and move every glyph
    document.fonts.ready.then(snap);
    window.addEventListener("resize", snap);
    window.addEventListener("click", focus);
    window.addEventListener("keydown", focus);
    input.addEventListener("keydown", onKeyDown);
    input.addEventListener("beforeinput", onBeforeInput);
    return () => {
      cancelAnimationFrame(c.frame);
      window.removeEventListener("resize", snap);
      window.removeEventListener("click", focus);
      window.removeEventListener("keydown", focus);
      input.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("beforeinput", onBeforeInput);
    };
  }, [s, code, onStart, onDone]);

  return (
    <div className={styles.view} ref={viewRef}>
      <input
        ref={inputRef}
        className={styles.input}
        autoFocus
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Type the code"
      />
      <div className={styles.layer} ref={layerRef}>
        <div className={styles.caret} ref={caretRef} />
        <div className={styles.chars} ref={charsRef}>
          {chars}
        </div>
      </div>
      <p className={styles.blurred}>click or press any key to focus</p>
    </div>
  );
}
