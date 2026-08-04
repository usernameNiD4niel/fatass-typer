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

Actual stack: React + TypeScript (strict) + Vite + **Three.js via React Three Fiber** +
Vanilla CSS / CSS Modules. Vitest for units and components, Playwright for e2e. No heavy
component library.

The scene was Canvas 2D until the three-lane rework (§4a). Everything in it is built from
primitive geometry — no models, no textures, no fonts, no remote assets of any kind.

---

## 3. Architecture rules

```
src/
├── game-core/      pure rules — no DOM, no React, no renderer
├── game-runtime/   the simulation: fixed timestep, hazards, the run
├── game-bridge/    command-in / event-out bus, plus the per-frame WorldSnapshot
├── game-scene/     Three.js — the road, the runner, the hazards, the word
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
`applyInput(state, wholeValue)`. There is no input element any more; `useTypingCapture`
keeps the buffer in a ref and feeds it the same way. Insertions, backspace, and paste are all handled
by diffing against the previous value. Counters are event-based (a mistake that is fixed
still counts as a mistake), and input is ignored once a prompt completes so nothing
resolves twice.

Models: `src/game-core/models/` holds every shared shape. Validators take `unknown` and
narrow honestly — **never `Partial<T>`**, which asserts that present fields already have
the right type and is exactly the assumption a corrupt save breaks. Shared primitives live
in `models/guards.ts`. Every persisted shape carries `schemaVersion`, and recovery
(`coerceSettings`, `coercePlayerProfile`) repairs field-by-field rather than discarding a
whole record (spec §17).

Motion: `src/game-core/motion/` owns the lane and jump curves, and it owns them because
the rules have to be able to answer "had the move finished when the hazard arrived". A
curve that lived in the renderer would make that unanswerable. The scene multiplies the
same numbers by lane width and apex height.

Navigation: `src/game-core/app-state/` owns the state machine (spec §4) — an explicit
transition table plus a pure `transition()`. `src/hooks/useAppMachine.ts` is the only
React binding to it. Screens never track navigation with their own booleans, and a
control is only rendered when `machine.can(event)` allows it.

Hard rules:

- **`game-core` imports nothing from the DOM, React, or a renderer.** It is
  deterministic, seeded, and fully unit-tested. This is the boundary a Rust
  implementation would later replace.
- `game-runtime` never imports React or Three.js. It decides what is true; it does not
  draw.
- `game-scene` draws and does not decide. Every position it renders comes from the
  snapshot — which is to say from `game-core`. It adds only what cannot change the outcome
  of a run: gait, lean, squash, camera drift.
- Neither React nor `game-scene` imports `game-runtime` internals — only `game-bridge`.
- No game rules inside React components.
- No persistence code inside rendering code.
- TypeScript strict. No `any`. Small focused modules. No magic numbers — map tuning
  lives in config files under `content/`.
- Per-frame data does not flow into React. The bridge emits UI *events* at a fixed low
  frequency (~10Hz); per-frame state goes into `WorldSnapshot`, which the scene reads and
  React never subscribes to.
- One render loop. The simulation is advanced from inside R3F's `useFrame` at priority
  `-1`, never from a second `requestAnimationFrame` chain of our own.

**These boundaries are enforced by ESLint, not by convention.** See the layer blocks in
`eslint.config.js`. `npm run lint` fails on a violation. Each layer folder also carries a
`README.md` stating its contract. Enforced today:

| Layer | Forbidden |
|---|---|
| `game-core` | browser globals, `Date.now`, `Math.random`, React, Three.js, all outer layers |
| `game-runtime` | React, Three.js, `game-scene`, `components`, `screens` |
| `game-scene` | `game-runtime` internals, `screens`, `storage` |
| `components` / `screens` / `App.tsx` | `game-runtime` internals — go through `game-bridge` |
| `content` | React, Three.js, `game-runtime`, `game-scene`, `components`, `screens` |

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

**The game is now a three-lane road runner.** The 41-step build plan below is complete
and historical; on top of it sits the **three-lane rework** (`typing_runner_claude_prompt.pdf`),
which replaced the gameplay itself. Read this block before the steps — several of them
describe systems that no longer exist.

| | |
|---|---|
| **Last completed** | coins, and a difficulty pass — denser hazards, faster road |
| **Next up** | nothing scheduled — awaiting direction |
| **In progress** | none |
| **Blocked** | none |

### What the game is

You run down a three-lane road. One hazard at a time comes at you. A **car** blocks your
lane and a word appears on the genuinely-open side; completing it starts an eased lane
change. A **jump hazard** blocks the lane and the word sits above it; completing it starts
a jump, *timed to the obstacle* rather than to the keystroke.

In the gap that follows, a **line of coins** appears one lane over with a word of its own.
Type it and you swerve across and take them; ignore it and you drive past. Coins cost
nothing to miss — no score, no combo, no run — and that is what makes them the only
optional thing in the game. They exist because the gap between hazards used to be several
seconds of empty road, and dead time was what made the game feel slow.

Hazards and coins alternate: neither spawns while the other is unanswered, so there is
only ever one word on screen, and it is always the one that can end the run.

Typing is forgiving within a word — a wrong character costs the combo, not the run, and can
be corrected — because accuracy is the statistic the unlock gates read. What is not
forgiving is the hazard: miss it and the run ends after a short impact beat.

**Typing the word does not survive the hazard.** It *commits* the player and pays out the
points; survival is decided at the collision plane by where their body actually is. In
practice a committed player always makes it, because `motionReserveMs` placed the hazard far
enough away — the check exists so that a retune which breaks that fails a test instead of
confusing a player.

### What changed, and what did not

| | |
|---|---|
| **Renderer** | Canvas 2D → **Three.js via React Three Fiber**, in the new `src/game-scene/` |
| **Dogs** | gone entirely — `game-core/chase`, the pack, the HUD meter, the copy |
| **Failure** | collision or timeout ends the run; the `stumbled` outcome is gone |
| **Input** | no typing field; global `keydown`, word drawn beside its hazard |
| **Boost** | no longer a prompt cycle — it is the reward for clearing a hazard |
| **Coins** | optional pickups one lane over, collected only by typing their word |
| **WPM** | measured over `activeTypingMs`, not wall-clock run time |
| **Kept** | six maps, unlock gates, progression, results, settings, statistics, storage |

### Where the new work lives

- `src/game-core/models/lane.ts` — three lanes, as an index. `motion.ts` — how long a move
  takes, and the derived time to clearance.
- `src/game-core/motion/` — the lane and jump curves. **The easing lives here, not in the
  scene**, because "had the move finished when the car arrived" is a question about the
  curve and it is the question the whole encounter turns on.
- `src/game-core/timing/motion-reserve.ts` — the road an avoidance move needs, on top of the
  typing budget. Deadline and animation read the same `MotionProfile`, so they cannot
  disagree.
- `src/game-core/obstacles/lane-assignment.ts` — the guarantee that a route always exists.
- `src/game-core/pickups/` — coins. Read its README before changing anything about them:
  every absent penalty in there is deliberate.
- `src/game-bridge/snapshot.ts` — `WorldSnapshot`, the per-frame half of the bridge
  contract. Mutated in place; React never sees it.
- `src/game-scene/` — the road, the runner, the hazards, the word, the camera.
- `src/hooks/useTypingCapture.ts` — the global keyboard, and the rules that stop it trapping
  the user.

### Tuning, as measured

`map-progression.test.ts` states each map as three assertions, over 24 seeds each:

- a perfect typist at the advertised speed finishes **100%** of runs;
- a realistic one (200ms to notice, one character in twenty wrong) finishes **≥ 80%**;
- one at **60%** of the advertised speed finishes **< 25%**.

All six pass. Runs are 70–80 seconds with **7–13 hazards and 6–9 coin lines** — roughly
double the encounters of the first pass, which had 7–11 hazards and nothing between them.

Density is capped by how long an encounter *lasts*, not by the interval between them: a
hazard is visible for roughly its whole budget, and the spawner will not overlap two.
Overlapping them was tried and it ends every run — the second word attaches while the
first move is still in flight, and committing to it preempts a move the player had already
earned. Density has to come from making an encounter shorter, which is where
`WARNING_LEAD_FACTOR` (1.6 → 1.15) and the one-lane reserve came from.

The realistic typist's error rate is 5% rather than 8% deliberately. With binary failure a
mistake on a four-letter word costs more time than typing 30% slower for the whole run, so
an 8% error rate *at* target speed describes somebody who is not a target-speed typist.

`content/fairness.test.ts` is the stronger guarantee: for every map × hazard × prompt the
game can produce, the budget covers the typing, the map never demands more than it
advertises, and the road covers the move. A playtest samples; that table proves.

### Known limits

- **Progress does not survive a reload.** `StorageAdapter` is the seam; the only
  implementation is in memory.
- **Adaptive assistance is effectively off.** It eases after three consecutive misses, and
  one miss now ends the run. `game-core/assistance/README.md` explains what changing it
  would mean.
- **`mistakeBehavior` and `caseSensitive`** are stored and displayed but not read by the
  typing engine.
- **The prompt is HTML, not 3D text.** drei's `<Text>` fetches a font from a CDN and this
  project ships no remote assets; `game-scene/README.md` sets out the trade.

### Health at this checkpoint

All green, verified by running them:

```bash
npm run test          # 850 passed, 52 files
npm run test:e2e      # 15 passed, Chromium against the production build
npm run lint          # clean
npm run typecheck     # clean
npm run format:check  # clean
npm run build         # succeeds
```

`docs/performance.md` has the frame-cost and bundle numbers, re-measured after the rework.

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
- [x] **F4** Adaptive assistance: small clamped buffer adjustments after repeated
      failures or a sustained accuracy streak. Never aggressive enough to feel unfair.
      The displayed target WPM stays honest. Spec §6.
- [x] **F5** `StorageAdapter` interface + in-memory implementation + run history +
      dev-only reset. Progress resets on reload — that is intended for now. An IndexedDB
      implementation is explicitly deferred; the interface is the seam for it.

### Phase G — Polish

- [x] **G1** Audio system: menu music, running music, danger layer as dogs approach,
      correct-character feedback, prompt-complete, boost, obstacle warning, collision,
      victory, game-over. Placeholders only, no copyrighted audio. Audio starts only
      after user interaction. Volume settings, music and SFX toggles. Spec §11.
- [x] **G2** Accessibility pass: full keyboard navigation, visible focus indicators,
      reduced-motion setting, color-independent success/error indicators, high-contrast
      prompt text, descriptive labels, no flashing effects. Spec §12.
- [x] **G3** Performance pass: 60 FPS target, zero React re-renders per animation frame,
      entity reuse, lazy-loaded non-essential screens, loading progress. Profile and
      record the results. Spec §16.
- [x] **G4** Playwright e2e desktop keyboard flows + README and docs + CI workflow
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
