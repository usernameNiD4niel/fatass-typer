# `components` — reusable UI primitives

Small, presentational, reusable. Button, Card, Panel, Toggle, Slider, Modal.

## Contract

- **No game rules here** (CLAUDE.md §3). Components render props and raise events.
- No direct `game-runtime` imports.
- Accessible by default: real semantics, visible focus states, labels.
- Styled with design tokens from `src/styles`. No hardcoded colors or spacing.
- No heavy component library — these are hand-built.

## Contents

- `ui/` — the primitives (step E1): `Button`, `Card` / `SelectableCard`, `Panel`, `Toggle`,
  `Slider`, `Modal`, plus the shared `classes` helper.
- `hud/` — the run HUD (step E4). `PromptDisplay` is the visual priority: largest type, a
  monospaced face so characters do not shift width as they are typed, and per-character
  state taken from **`game-core`'s own comparison** rather than a second implementation —
  the HUD and the rules must agree about what counts as correct. `Hud` is everything else,
  deliberately quieter: four small readouts and two meters (to finish, dogs). `PauseOverlay`
  sits over the frozen canvas rather than replacing it, and takes focus on open — left in
  the typing field, the first keystroke of the resume would be swallowed and a keyboard
  player could not reach its controls at all.
- `typing-input/` — the typing field (step C6). A real, focused `<input>`, never a global
  `keydown` listener: text construction belongs to the browser, and only a real field gets
  IME composition, dead keys, `Backspace` semantics, and assistive-technology keyboards.
  `normalize.ts` is the pure part — it folds newlines and exotic spaces to a plain space,
  strips invisible characters, caps the length, and decides which keys to swallow. `Tab`
  and `Escape` are deliberately **not** swallowed: focus must keep moving and pause must
  keep working.

The field sends whole values (`submitInput`), not keystrokes, matching the typing engine's
diffing model (CLAUDE.md §3). It holds no game rules.

**Native elements, always.** A button is a `<button>`, a slider is an
`<input type="range">`, a selectable card is a button too. Every one of them brings keyboard
operation, focus behaviour, and assistive-technology semantics that a styled `<div>` would
have to reimplement — badly. The `Toggle` is the one exception, and it is still a button
wearing `role="switch"`.

The HUD refuses to overload (spec §4). Two meters, because they answer the only two
questions that matter mid-run — _how far to go_ and _how close are they_ — and the dog
meter says "Closing" or "Right behind you" in words, not only in red.

**State is never colour alone** (spec §12). The toggle prints ON/OFF on its track as well as
moving the knob; the slider shows its formatted value and mirrors it into `aria-valuetext`,
so "60%" is announced rather than "0.6"; a selected card sets `aria-pressed`.

`Modal` does the four things that make a dialog usable rather than merely visible: focus
moves in on open, Tab cycles inside it, Escape closes it, and focus returns to whatever
opened it. It is built on a plain element rather than `<dialog>` because `showModal` still
varies across browsers on focus restoration, and this behaviour is short enough to own.

The tests drive these through the accessibility tree — role, name, state — not class names.
That is how assistive technology sees them, and it is the part that must not regress.
