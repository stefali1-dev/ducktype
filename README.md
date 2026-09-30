# ducktype

Touch-typing practice on real code instead of English words. You type functions, models and routes taken from popular Python projects, in a quiet, minimal interface.

## How it works

- Each exercise is one function, class or route (5–30 lines) from FastAPI, Pydantic, the official FastAPI template or [Polar](https://github.com/polarsource/polar).
- Tabs pick what you practice: **all · routes · models · queries**.
- It types like an editor: Enter takes you to the next line and fills in the indentation and blank lines.
- Keys: `tab` restart, `esc` next snippet, `enter` next after the results.
- Results show WPM, accuracy, time and your best on that snippet (saved in your browser).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Checks: `npm test` (typing engine), `npm run lint`, `npm run e2e` (Playwright smoke test).

## Snippets

`data/snippets.json` is generated and committed. To rebuild it from the repos pinned in `scripts/sources.json`:

```bash
python3 scripts/extract.py
```

The code in the snippets belongs to its authors (MIT and Apache-2.0 licensed). Each snippet links to its source, and `/credits` lists every repo and commit.

## Layout

| Path | What |
|---|---|
| `lib/typing.ts` | typing engine: keys, errors, WPM, accuracy |
| `components/TypingArea.tsx` | the code view, caret and key handling |
| `components/Trainer.tsx` | page state, tabs, results |
| `scripts/extract.py` | turns source repos into snippets |
