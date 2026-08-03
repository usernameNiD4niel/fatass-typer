# `screens` — full-screen views

One folder entry per app state: splash, main menu, map selection, level briefing, game,
results, settings, statistics, tutorial.

## Contract

- Screens compose `components`; they do not define new primitives.
- **No game rules here** (CLAUDE.md §3). Rules live in `game-core`.
- Screen switching is driven by the app state machine (step A5), not by ad-hoc booleans.
- Keyboard navigable end to end.

## Contents

- `splash/` — title and loading (step E2). Progress is announced as text as well as drawn as
  a bar, and it is skippable. The pending-asset count is a **prop**: a screen may not reach
  into `game-runtime`, so when real loading exists the number arrives over the bridge.
- `main-menu/` — the menu (step E2). Presentational: handed a profile, raises events. Shows
  the furthest unlocked map, the sustainable peak, and lifetime accuracy — a player who has
  never typed sees a dash, not a fabricated `0 WPM`. `menu-progress.ts` holds the pure
  helpers, kept out of the component file so fast refresh keeps working.
- `game/` — the playable screen (step C7). Mounts a canvas, attaches a bridge to it via
  `attachGame`, and renders what comes back: the active prompt, a minimal HUD, the typing
  field, and the run outcome. Step E4 designs the real HUD and E5 the results screens.

It imports `game-bridge` and never `game-runtime`. Everything it shows arrives at the
bridge's ~10Hz, so no per-frame data reaches React. Unmounting tears down the loop, the
canvas, and the bridge together.

States with no screen yet fall through to the development harness in `App.tsx` — a button
per legal transition. It shrinks as phase E lands and disappears with the last screen.

The menu's **Statistics** control is deliberately disabled and labelled "not available yet":
the app machine has no Statistics state until E6, and a menu that silently grows an entry
later is more disorienting than one that admits the gap.

The rest of the screens arrive in phase E. See CLAUDE.md §5.
