# `components` — reusable UI primitives

Small, presentational, reusable. Button, Card, Panel, Toggle, Slider, Modal.

## Contract

- **No game rules here** (CLAUDE.md §3). Components render props and raise events.
- No direct `game-runtime` imports.
- Accessible by default: real semantics, visible focus states, labels.
- Styled with design tokens from `src/styles`. No hardcoded colors or spacing.
- No heavy component library — these are hand-built.

## Contents

- `typing-input/` — the typing field (step C6). A real, focused `<input>`, never a global
  `keydown` listener: text construction belongs to the browser, and only a real field gets
  IME composition, dead keys, `Backspace` semantics, and assistive-technology keyboards.
  `normalize.ts` is the pure part — it folds newlines and exotic spaces to a plain space,
  strips invisible characters, caps the length, and decides which keys to swallow. `Tab`
  and `Escape` are deliberately **not** swallowed: focus must keep moving and pause must
  keep working.

The field sends whole values (`submitInput`), not keystrokes, matching the typing engine's
diffing model (CLAUDE.md §3). It holds no game rules.

The E1 primitives — Button, Card, Panel, Toggle, Slider, Modal — arrive later.
See CLAUDE.md §5.
