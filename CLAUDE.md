# Typing Chase — Build Guide

## 1. Project overview

Desktop-first typing game, delivered as a web app. Side-scrolling 2D endless-runner:
a heavy-set main character (MC) runs toward a finish line while three dogs chase from
behind. Typing boost prompts speeds the MC up. Obstacles carry prompts that must be
typed before impact, or the MC stumbles and the dogs close in. Six maps, rising target
WPM from 20 to 50.

**Web app only.** Physical keyboard required. Minimum width 1024px. Mobile is out of
scope. No desktop packaging, no native shell, no PWA install target unless the user
asks for one later.

The full spec lives in `claude_typing_chase_game_prompt.md`. This file is the build
plan — steps reference the spec by section (e.g. "spec §13") rather than restating it.

---

## 2. Stack and scope decisions

These override the spec. Do not reintroduce the left column without an explicit
instruction from the user.

| Spec says | We do instead | Why |
|---|---|---|
| Rust + Bevy compiled to WASM | TypeScript-only runtime. Keep `game-core` pure and DOM-free so a Rust + WASM swap stays possible later | Fastest path to working functionality + UI |
| IndexedDB / Dexie persistence | In-memory store behind a `StorageAdapter` interface | No database yet |
| Tauri Windows packaging | Dropped. Web app only | Out of scope |

Everything else in the spec stands: game rules, difficulty model, sustainable peak WPM,
six maps, iOS-inspired desktop UI, accessibility, automated tests.

Actual stack: React + TypeScript (strict) + Vite + Canvas 2D + Vanilla CSS / CSS Modules.
Vitest for units and components, Playwright for e2e. No heavy component library.

---

## 3. Architecture rules

```
src/
├── game-core/      pure rules — no DOM, no React, no canvas
├── game-runtime/   canvas renderer + fixed-timestep loop
├── game-bridge/    command-in / event-out bus
├── storage/        StorageAdapter interface + in-memory impl
├── content/        word lists, map configs, obstacle data
├── components/     reusable UI primitives
├── screens/        full-screen views
├── hooks/          React bindings onto game-core (e.g. useAppMachine)
├── styles/         design tokens, global CSS
└── main.tsx
```

Randomness: `src/game-core/random/` is the only source. `Math.random` is lint-banned in
game-core. Every draw returns `{ value, rng }` — the next generator travels with the value,
so randomness is threaded as data and never hides in module state. Same seed, same run.

Typing: `src/game-core/typing/` compares **whole input values**, not key events —
`applyInput(state, inputElementValue)`. Insertions, backspace, and paste are all handled
by diffing against the previous value. Counters are event-based (a mistake that is fixed
still counts as a mistake), and input is ignored once a prompt completes so nothing
resolves twice.

Models: `src/game-core/models/` holds every shared shape. Validators take `unknown` and
narrow honestly — **never `Partial<T>`**, which asserts that present fields already have
the right type and is exactly the assumption a corrupt save breaks. Shared primitives live
in `models/guards.ts`. Every persisted shape carries `schemaVersion`, and recovery
(`coerceSettings`, `coercePlayerProfile`) repairs field-by-field rather than discarding a
whole record (spec §17).

Navigation: `src/game-core/app-state/` owns the state machine (spec §4) — an explicit
transition table plus a pure `transition()`. `src/hooks/useAppMachine.ts` is the only
React binding to it. Screens never track navigation with their own booleans, and a
control is only rendered when `machine.can(event)` allows it.

Hard rules:

- **`game-core` imports nothing from the DOM, React, or the renderer.** It is
  deterministic, seeded, and fully unit-tested. This is the boundary a Rust
  implementation would later replace.
- `game-runtime` never imports React. React never imports `game-runtime` internals —
  only `game-bridge`.
- No game rules inside React components.
- No persistence code inside rendering code.
- TypeScript strict. No `any`. Small focused modules. No magic numbers — map tuning
  lives in config files under `content/`.
- Per-frame data does not flow into React. The bridge emits UI updates at a fixed
  low frequency (~10Hz), never once per animation frame.

**These boundaries are enforced by ESLint, not by convention.** See the layer blocks in
`eslint.config.js`. `npm run lint` fails on a violation. Each layer folder also carries a
`README.md` stating its contract. Enforced today:

| Layer | Forbidden |
|---|---|
| `game-core` | browser globals, `Date.now`, `Math.random`, React, all outer layers |
| `game-runtime` | React, `components`, `screens` |
| `components` / `screens` / `App.tsx` | `game-runtime` internals — go through `game-bridge` |
| `content` | React, `game-runtime`, `components`, `screens` |

---

## 4. Working protocol

Read this before starting any step.

1. **One step at a time.** Do not batch steps. Do not start a step whose prerequisites
   are not `[x]`.
2. Flip the step marker to `[~]` in this file *before* starting, and to `[x]` only when
   the work is done **and its tests actually ran and passed**.
3. Never claim a test passed without running it. If something is incomplete, mark it
   `[!]` with a one-line reason rather than `[x]`.
4. At the end of each step, report three things: files added/changed, the exact command
   to verify it, anything left incomplete.
5. **Update the RESUME HERE block below** whenever a step's status changes. That block is
   how a new session finds its place.
5. Do not rewrite earlier steps' work without a stated reason. Preserve working behavior.
6. Never leave `// implementation goes here` placeholders. A simple working
   implementation beats a stub.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done and tested · `[!]` blocked

**The user approves each step before it starts.** Complete one step, report, then stop and
wait. Do not begin the next step unprompted.

---

## 4a. RESUME HERE

> Keep this block current. It is the first thing to read when picking the project back up.

**Progress: 35 / 41 steps complete.** Phases A through E are finished. **Map 1 is
playable end to end** with obstacles, and a simulated typist at its advertised 20 WPM
finishes it (spec §19 milestone 2).

| | |
|---|---|
| **Last completed** | **F3** — maps 2 to 6, tuned across the whole ladder |
| **Next up** | **F4** — adaptive assistance (awaiting approval) |

**All six maps are tuned (F2, F3).** `session/playtest-harness.ts` drives a metronomic
simulated typist; `map-1-playtest.test.ts` and `map-progression.test.ts` state the results as
assertions, because playtesting a typing game by hand measures the tester. Every map is
finishable at its advertised speed *including while mistyping one character in twelve*, and
no prompt a map can spawn demands more WPM than the map advertises. Survival thresholds run
roughly 12 → 29 WPM across the ladder.
| **In progress** | none — no step is half-done |
| **Blocked** | none |

| Phase | Status |
|---|---|
| A — Foundation | ✅ 5 / 5 |
| B — `game-core` pure rules | ✅ 8 / 8 |
| C — Runtime + playable slice | ✅ 7 / 7 |
| D — Obstacles & map rules | ✅ 5 / 5 |
| E — UI shell | ✅ 7 / 7 |
| F — Content, maps, storage | 🟨 3 / 5 |
| G — Polish | ⬜ 0 / 4 |

**Health at this checkpoint** — all green, verified by actually running them:

```bash
npm run test          # 879 passed, 52 files
npm run lint          # clean
npm run typecheck     # clean
npm run format:check  # clean
npm run build         # succeeds
```

**What exists so far.** The complete rules engine, pure and DOM-free, under
`src/game-core/`: `models/` `app-state/` `typing/` `stats/` `timing/` `chase/` `scoring/`
`random/` `content/`. Plus the Vite/React scaffold, design tokens, and a throwaway
state-machine harness in `App.tsx` that phase E replaces.

`src/game-runtime/` now holds `loop/` (the frame driver — `drainAccumulator` plus
`GameLoop` with an injected clock and scheduler, 60Hz fixed updates, interpolation alpha,
frame and step clamps), `render/` (camera, parallax layers, theme palettes, HiDPI canvas
sizing, `drawScene`, and the `CanvasRenderer` that owns the element), `actors/` (the MC's animation
state machine and vector art, plus the three-dog pack derived from `ChaseState`), and
`assets/` (the manifest — all entries optional, since the art is vector placeholders).

`src/game-bridge/` holds the React seam: the `GameCommand` / `GameEvent` contract, boundary
validation, and `GameBridge` — which throttles live stats to ~10Hz and drops every listener
on `destroy`. No host is attached to it yet; C7 supplies one.

`src/components/ui/` holds the primitives — Button, Card, Panel, Toggle, Slider, Modal — all
built on native elements and tested through the accessibility tree. `src/components/hud/`
holds the run HUD: the prompt display (per-character state from `game-core`'s own
comparison) and the quieter readouts and meters around it.
`src/components/typing-input/` is the typing field: a focused `<input>` that normalises text
and sends whole values through the bridge. `src/screens/game/` mounts the canvas and renders
the prompt, HUD, and outcome. `src/game-runtime/session/` holds the run itself — a pure
`run-session` plus the `RuntimeHost` that gives it a loop, a renderer, and a clock.
`src/content/` has all six maps, the seven obstacle definitions, and the full vocabulary —
around 200 prompts across eight categories, gated by map number.
`src/game-core/obstacles/` schedules them and places them: seeded spawning, then a placement
derived from the B5 timing budget so the prompt is always on screen early enough for the
map's stated WPM, plus resolution — avoided, stumbled, or hit, decided once. See that
folder's README for the three moments and the three endings.

Runs include obstacles end to end: spawned on schedule, drawn on the canvas with a warning
chevron and then a deadline bar, resolved as avoided, stumbled, or hit, with the
consequences applied to chase distance, combo, score, and run statistics. Escape pauses from
anywhere on the screen.

`src/screens/` now has the splash, main menu, map selection, level briefing, run results,
settings, statistics, tutorial, and width guard alongside the game screen. `App.tsx` routes
to them exhaustively from the state machine, so a new state fails the build until it has a
screen — the development harness is gone. Choosing a map is what the run actually uses, and
a finished run reports its result up to the shell, which owns what happens next.
`src/hooks/usePlayerProfile.ts` holds the profile in memory — a placeholder F5 replaces with
the `StorageAdapter`.

**What does not exist yet.** No
persistence — `storage/` is still a README, and progress does not survive a reload. The UI
is a placeholder: `App.tsx` is the A5 harness with the game screen bolted on, and the real
screens, primitives, and HUD arrive in phase E. Maps 2–6 and the full content set are
phase F.

---

## 5. Steps

### Phase A — Foundation

- [x] **A1** Vite + React + TypeScript scaffold. Strict mode, `noImplicitAny`, no `any`.
      ESLint + Prettier configured. npm scripts wired (see §6).
- [x] **A2** Vitest + Testing Library setup. One smoke test that actually runs and passes.
- [x] **A3** Folder skeleton per §3. Add an ESLint `no-restricted-imports` rule (or
      equivalent) forbidding DOM/React/renderer imports inside `game-core`.
- [x] **A4** Design tokens in `styles/tokens.css`: light + dark color scales, spacing
      scale, radii, shadows, Inter/system font stack, motion durations. Spec §9.
- [x] **A5** App state machine — `Boot · MainMenu · MapSelection · PreRunCountdown ·
      Running · Paused · PlayerHit · LevelComplete · GameOver · Results · Settings`
      (plus `Statistics`, added in E6 for the menu entry spec §9 asks for).
      Explicit transition table, unit-tested. No state booleans scattered around. Spec §4.

### Phase B — `game-core` pure rules

Each step ships its own unit tests. Nothing here touches the DOM.

- [x] **B1** Types: `PromptEntry`, `ObstacleDefinition`, `MapConfig`, `GameSettings`,
      `RunResult`, `MapProgress`, `PlayerProfile`. All persisted shapes carry
      `schemaVersion`. Spec §14, §15.
- [x] **B2** Typing comparison engine: per-character state (correct / current /
      incorrect / untyped), backspace, case-insensitive by default, punctuation and
      spaces, configurable mistake behavior. Spec §5 "Typing input system".
- [x] **B3** Stats: gross WPM (`chars / 5 / elapsed_minutes`), run average, raw peak,
      accuracy, correct/incorrect/corrected characters. Spec §7.
- [x] **B4** `sustainablePeakWpm` — rolling 10–15s window with a minimum character
      count, a minimum accuracy threshold, and a maximum idle gap. This is the headline
      lifetime stat; a one-second burst must never become the record. Spec §7.
- [x] **B5** Prompt timing: `expected_typing_seconds` and `available_seconds` per the
      spec formula. Per-map reaction buffer. Effective character count includes spaces
      and punctuation. Spec §6.
- [x] **B6** Chase-distance model: one logical meter. Penalty on collision or missed
      prompt, gain on accuracy streak, catch at zero. No physical AI simulation.
      Spec §5 "Dog chase system".
- [x] **B7** Scoring + combo: base prompt score + speed bonus + accuracy bonus +
      remaining-time bonus + combo multiplier − collision penalty. Lifetime score
      clamped at ≥ 0. Spec §8.
- [x] **B8** Seeded RNG + prompt selection: filter by category / difficulty / minimum
      map, prevent immediate repetition, fully deterministic under a fixed seed.
      Spec §15.

### Phase C — Runtime and first playable slice

- [x] **C1** Fixed-timestep game loop with an accumulator, decoupled from the React
      render cycle.
- [x] **C2** Canvas 2D renderer scaffold: side-scrolling camera, parallax background
      layers, asset manifest file with isolated asset paths. Spec §10.
- [x] **C3** MC placeholder from vector shapes + animation state machine: idle, running,
      boosting, jumping, sliding, stumbling, hit, victory, caught. World speed is driven
      by game rules, not by animation speed. Spec §5, §10.
- [x] **C4** Three dogs rendered, positions driven by B6, with escalating visual danger
      cues as they close in.
- [x] **C5** Bridge: `GameCommand` in, `GameEvent` out per spec §13. Validate messages
      at the boundary. Emit stats at a fixed ~10Hz, never per frame. Clean up listeners
      on canvas unmount.
- [x] **C6** Typing input: a real focused `<input>` element — not global `keydown` — for
      text construction. Backspace, punctuation, spaces. Ignore unsupported control keys.
      Send normalized input events through the bridge.
- [x] **C7** **Vertical slice.** Boost prompts grant a visible speed boost, the finish
      line is reachable, the dogs can catch the MC and end the run. First genuinely
      playable build. Spec §19 Milestone 1 acceptance criteria.

### Phase D — Obstacles and map rules

- [x] **D1** Obstacle definitions and data: crate, low barrier, hanging sign, puddle,
      trash bin, roadwork barrier, narrow passage. Spawner driven by map config. Spec §5.
- [x] **D2** Time-to-impact calculation, prompt attachment, and an early warning event,
      using B5 timing so the prompt appears early enough for the map's target WPM.
- [x] **D3** Resolution: success triggers the correct avoidance animation (jump / slide /
      sidestep); deadline expiry triggers hit or stumble. Hard guard against double
      resolution.
- [x] **D4** Consequences wired through: dog distance, combo break, score, run
      statistics. Tests for resolution and timing edge cases.
- [x] **D5** Pause / resume / restart, Escape to pause. Map 1 fully data-driven and
      playable end to end. Spec §19 Milestone 2.

### Phase E — UI shell

iOS-inspired desktop visual language — clean hierarchy, generous whitespace, rounded
cards, soft translucent panels, restrained palette, spring-like transitions. Spec §9.

- [x] **E1** UI primitives: Button, Card, Panel, Toggle, Slider, Modal. Accessible, with
      strong visible focus states. No component library.
- [x] **E2** Splash / loading screen + main menu: title, Start, Continue (when progress
      exists), Maps, Statistics, Settings, highest unlocked map, sustainable peak WPM,
      overall accuracy.
- [x] **E3** Map selection cards (name, target WPM, theme, locked state, best score,
      best accuracy, completion status, unlock requirement) + level briefing screen.
- [x] **E4** Game HUD. The active prompt is the clear visual priority. Also: typed
      progress, current WPM, accuracy, combo, progress to finish, dog threat distance,
      obstacle time pressure, pause control. Do not overload it.
- [x] **E5** Pause overlay + level-complete + game-over + detailed run results (score,
      average WPM, sustainable peak, accuracy, obstacle success rate, longest combo,
      mistakes, new records, unlocks, Retry / Next Map / Return to Maps).
- [x] **E6** Settings screen (theme, reduced motion, prompt text size, mistake behavior,
      volumes, dev-only reset progress) + Statistics screen.
- [x] **E7** First-run tutorial + desktop width guard (polished message below 1024px) +
      light/dark theme wiring across all screens.

### Phase F — Content, maps, storage

- [x] **F1** Word and phrase content files by category: common short / medium / long
      words, punctuation, numbers, short phrases, medium phrases, map-themed vocabulary.
      No slurs, no obscure words in beginner maps, no ambiguous whitespace. Spec §15.
- [x] **F2** Map 1 tuned for a genuine 20 WPM typist. Playtest and adjust the numbers.
- [x] **F3** Maps 2–6: configs, visual themes, vocabulary, reaction buffers
      (1.55 → 1.40 → 1.28 → 1.18 → 1.08), unlock accuracy gates (85% → 92%). Data-driven,
      not hardcoded into systems. Spec §6.
- [ ] **F4** Adaptive assistance: small clamped buffer adjustments after repeated
      failures or a sustained accuracy streak. Never aggressive enough to feel unfair.
      The displayed target WPM stays honest. Spec §6.
- [ ] **F5** `StorageAdapter` interface + in-memory implementation + run history +
      dev-only reset. Progress resets on reload — that is intended for now. An IndexedDB
      implementation is explicitly deferred; the interface is the seam for it.

### Phase G — Polish

- [ ] **G1** Audio system: menu music, running music, danger layer as dogs approach,
      correct-character feedback, prompt-complete, boost, obstacle warning, collision,
      victory, game-over. Placeholders only, no copyrighted audio. Audio starts only
      after user interaction. Volume settings, music and SFX toggles. Spec §11.
- [ ] **G2** Accessibility pass: full keyboard navigation, visible focus indicators,
      reduced-motion setting, color-independent success/error indicators, high-contrast
      prompt text, descriptive labels, no flashing effects. Spec §12.
- [ ] **G3** Performance pass: 60 FPS target, zero React re-renders per animation frame,
      entity reuse, lazy-loaded non-essential screens, loading progress. Profile and
      record the results. Spec §16.
- [ ] **G4** Playwright e2e desktop keyboard flows + README and docs + CI workflow
      (build, lint, test).

**41 steps total.**

---

## 6. Commands

```bash
npm install
npm run dev           # Vite dev server (http://localhost:5173)
npm run build         # tsc --build && vite build
npm run preview       # serve the production build
npm run typecheck     # tsc --build --force
npm run test          # Vitest, single run
npm run test:watch    # Vitest watch mode
npm run test:coverage # Vitest + v8 coverage
npm run lint          # ESLint
npm run format        # Prettier write
npm run format:check  # Prettier check
```

Not wired yet: `test:e2e` (arrives in G4).

Styling: `src/styles/tokens.css` is the only place raw values live. Components reference
**semantic** tokens (`--surface-raised`, `--text-primary`, `--status-danger`), never
primitives (`--color-neutral-200`) and never literals. Theme flips via `data-theme` on
`<html>`; with no attribute set it follows `prefers-color-scheme`. Reduced motion collapses
all `--duration-*` to `0ms`. `src/styles/tokens.test.ts` fails the build if a token exists
in one theme but not the other.

Test conventions: unit and component tests are colocated as `src/**/*.test.ts(x)`.
Vitest globals are **off** — import `describe` / `it` / `expect` from `vitest` explicitly.
Shared harness lives in `src/test/setup.ts` (jest-dom matchers + Testing Library cleanup).
