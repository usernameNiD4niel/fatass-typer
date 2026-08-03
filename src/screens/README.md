# `screens` — full-screen views

One folder entry per app state: splash, main menu, map selection, level briefing, game,
results, settings, statistics, tutorial.

## Contract

- Screens compose `components`; they do not define new primitives.
- **No game rules here** (CLAUDE.md §3). Rules live in `game-core`.
- Screen switching is driven by the app state machine (step A5), not by ad-hoc booleans.
- Keyboard navigable end to end.

## Contents

- `game/` — the playable screen (step C7). Mounts a canvas, attaches a bridge to it via
  `attachGame`, and renders what comes back: the active prompt, a minimal HUD, the typing
  field, and the run outcome. Step E4 designs the real HUD and E5 the results screens.

It imports `game-bridge` and never `game-runtime`. Everything it shows arrives at the
bridge's ~10Hz, so no per-frame data reaches React. Unmounting tears down the loop, the
canvas, and the bridge together.

The rest of the screens arrive in phase E. See CLAUDE.md §5.
