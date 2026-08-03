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
- `map-selection/` — one card per map (step E3). A locked map is a **disabled** card, not a
  hidden one: seeing the shape of the progression is the point. Each locked card states what
  would unlock it — the map to beat and the accuracy needed — because "Locked" alone tells
  the player nothing they can act on. `map-card-model.ts` holds that wording as pure,
  testable functions, including the card's one-sentence accessible name.
- `level-briefing/` — what the map asks before the run starts (step E3): target speed,
  distance, rough length, the obstacles and how to get past each, and previous bests. It
  occupies the machine's `PreRunCountdown` state rather than inventing a new one.
- `results/` — the end of a run (step E5). **One screen for both endings**: a player who was
  caught gets the same detail as one who finished — the difference is the heading and which
  action leads, not how much information they are trusted with. `run-summary.ts` decides
  records and unlocks as pure functions, because "you set a record" and "you unlocked a map"
  are claims, and a claim the UI invents is worse than one it omits. Beating a best is
  strictly greater-than; matching it is not a record. An unlock needs **both** a finished run
  and the accuracy gate — finishing scrappily is a win, not a promotion — and a missed
  unlock says exactly what was needed.
- `settings/` — every setting, each with a description of what it _does_ (step E6). Several
  of these change how the game feels, and a player should not have to experiment to find out
  which. Reset progress is destructive, so it asks first — and it keeps the player's
  settings, since those are preferences, not achievements.
- `statistics/` — the lifetime view (step E6). The headline is the sustainable peak, with a
  note saying what it means. A map never played shows a dash, not a zero.
- `game/` — the playable screen (step C7). Mounts a canvas, attaches a bridge to it via
  `attachGame`, and renders what comes back: the active prompt, a minimal HUD, the typing
  field, and the run outcome. Step E4 designs the real HUD and E5 the results screens.

It imports `game-bridge` and never `game-runtime`. Everything it shows arrives at the
bridge's ~10Hz, so no per-frame data reaches React. Unmounting tears down the loop, the
canvas, and the bridge together.

States with no screen yet fall through to the development harness in `App.tsx` — a button
per legal transition. It shrinks as phase E lands and disappears with the last screen.

Which map the player picked lives in `App.tsx` state. That is _data_, not navigation: where
the player is stays the machine's business (CLAUDE.md §3).

Settings reach the document through `hooks/useAppliedSettings.ts` — the one place a
preference becomes a DOM change. `tokens.css` already defines what each value means, so the
hook only says _which_: `data-theme`, `--prompt-font-size`, `data-reduced-motion`. A `null`
reduced-motion setting **removes** the attribute rather than setting it off, so a system
asking for less motion is never overruled by a default.

The rest of the screens arrive in phase E. See CLAUDE.md §5.
