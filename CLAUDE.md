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
| IndexedDB / Dexie persistence | `StorageAdapter` interface, with a hand-written IndexedDB implementation and an in-memory fallback. No Dexie | The interface is the seam; the wrapper was never the hard part |
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
| **Last completed** | **biomes** — six maps that are six *places*: forest, desert, docks, night, volcano, and the city they all used to be |
| **Next up** | nothing scheduled — awaiting direction |
| **In progress** | none |
| **Blocked** | none |

### What the game is

You run down a three-lane road with **a word in front of you at all times**, and something
behind you. Finishing a word pushes the chaser back and speeds you up; letting one lapse
lets it close. It reaching you is the **only** way to lose — nothing on the road can be
collided with, because there is nothing on the road.

**Every prompt in a run is the next word of one sentence** — the map's secret. Flow words,
coins and crates all draw from it, in order, so a run assembles something readable instead
of a word list. Finish it and the map gives up a short piece of writing, shown on the
results screen. A word the player never finishes comes back on the next encounter, so
declining a coin never costs the secret. See `content/secrets.ts`.

Short words are *generous*, not hard — the flat reaction allowance means "the" on Map 1
demands about 15 WPM on a map advertising 20 — so a prompt takes sentence words until it
is worth asking for: "of our", then "street has", rather than three free words.

**A word on screen is never swapped out** by another word. A coin line or a crate takes the
field from a flow word, which costs nothing to drop; nothing else preempts anything.

In the gaps, a **line of coins** appears one lane over with a word of its own. Type it and
you swerve across and take them; ignore it and you drive past. Coins cost nothing to miss —
no score, no combo, no ground — and that is what makes them the only optional thing in the
game. They are collected **one at a time**, each decided at its own plane.

Typing is forgiving within a word — a wrong character costs the combo and a little ground,
and can be corrected — because accuracy is the statistic the unlock gates read.

### The race

Two opponents run the same road (`game-core/race`). They do not type, cannot be
collided with, and **cannot end a run** — the chaser keeps that job. What they do
is take coins: whoever is in front reaches a coin first, so a player who never
leads never collects one. Placement pays a bonus on a run that reaches the
finish line, and is shown on the results screen.

Their pace is drawn from a band around the map's own reference speed and
re-drawn every few seconds, so a lead has to be held rather than established
once. At the map's advertised speed the player is neck and neck with them; above
it they pull clear and keep every coin. `race/README.md` records the tuning and
what was tried first.

### Why the opponents chase

They used to be moving obstacles: drawn pace, re-drawn every few seconds, and no idea whether
they were winning. Get twenty metres up and they were gone for the rest of the run — the race
was decided in its first thirty seconds.

So a racer that is **more than 25 metres behind** runs harder, by 0.05 m/s per metre of deficit,
capped at 22% of the map's pace (`racer.ts`). A racer in front gets nothing: a rubber band, not
a leash. A lead still extends — it just has to be held.

**The dead band is the whole trick, and it was found the hard way.** Without it the chase fires
in a race that is already level, where somebody is always a few metres down, and a typist at the
map's own advertised speed took **zero** coins on every map. The obvious lever — raising the
opponents' drawn pace, flat or as a ladder up the six maps — was tried first and failed the same
assertion, for the same reason: pace moves *both* ends of the race, and the margin the map's own
audience beats a bot by is small enough to eat.

### The rival badges

How far each opponent is, drawn **beside the runner** rather than in the top bar
(`game-scene/RivalBadges.tsx`): a ring in that opponent's own colours with the
gap under it in the same colour, signed from them — `-5 m` means they are five
metres behind you. Written into the DOM from `useFrame`, so it is per-frame
rather than the bridge's 10Hz.

The same numbers stay in the HUD as visually-hidden text. The scene is drawn and
unlabelled, so moving them into the world would otherwise have removed them for
anybody not looking at it.

### The surge

Every minute, everybody gets one: a long sentence for the player, and a shove
for the two opponents weighted to whoever is behind. Typing it holds the
player's momentum up as they go, and finishing it clean pays a full-pace boost
for twelve seconds — **one wrong character ends it**. It is the game's only
catch-up mechanic, and `game-core/surge/README.md` records the two ways the
first build of it was wrong.

### The wardrobe

Placing in a race and collecting coins pay **credits**, spent on the `Wardrobe`
screen for a character, shoes, and what a finished word does. **None of it
changes a rule** — see `game-core/wardrobe/README.md`, which is where that
promise is written down and why it matters. A run the chaser ended pays nothing.

The seam: `game-scene` may not read the profile or the catalogue, and
`game-core/wardrobe` may not know what a shirt is, so `content/runner-look.ts`
translates a profile into five colours and hands them over.

### Speed, and the chaser

**Speed is momentum** (`game-core/motion/momentum.ts`): a level from 0 to 1, topped up by
every completed word by how much of its budget was left, and **kept** rather than leaked.
A wrong character costs a little of it; a pause lets it fall back to a coasting floor and
no further. It is a level rather than a countdown because a word finishes every second or
two, and a refreshed timer would simply never lapse.

**The chaser is the whole of the difficulty** (`game-core/pursuit/`). Every completed word
grants ground by the same margin; a lapsed word and a mistyped character take it. Its
break-even margin is **derived per map** from that map's word budget — see
`pursuit/tuning.ts`, which is where the six-map ladder now lives.

**Shields absorb being caught**, resetting the gap, because with nothing to collide with
that is the only thing left for a life to mean.

### What changed in the hazard-free rework

| | |
|---|---|
| **Hazards** | gone entirely — `game-core/obstacles`, `content/obstacles.ts`, `models/obstacle.ts`, `timing/motion-reserve.ts`, `game-scene/Hazards.tsx` |
| **Failure** | only `caught`. `collision`, `timeout` and `late-move` are gone |
| **Speed** | boost timer → `momentum`, earned from *every* word rather than only from hazards |
| **Flow words** | were a gap-filler bound to a committed hazard; now the default state of the field |
| **The ladder** | lives in `flowBufferFor(map)` — each map's buffer sits between 1/0.85 and 1/0.75, so a typist in the tolerance band never lapses a word and one below it lapses constantly |
| **HUD** | the m/s speed meter became a **pace bar**: current WPM against the map's target |
| **Scene** | shadows, PBR materials, procedural asphalt and sky, ACES tone mapping, a capsule-and-joint human runner, ambient traffic on flanking carriageways |
| **Kept** | six maps, unlock gates, progression, results, settings, statistics, storage, coins, crates, the secret sentence |

### Variety — why two runs of a map are not the same run

The complaint this answers was replay: the same map gave the same words in the same order,
every time. The cause was not a small word list. It was that **each map had exactly one
secret sentence**, and the sentence *is* the prompt order — so the word list barely mattered.

Four things vary now, all from the run seed, so a run stays reproducible:

| | |
|---|---|
| **The sentence** | three secrets per map, `pickSecret(mapId, seed)`. This is the fix; the rest is dressing |
| **The words** | ~90 more in `content/prompts/words.ts`, the long ones gated to `minimumMap: 4` |
| **The sky** | `game-scene/weather.ts` — clear, rain, snow or storm. Clear is weighted heaviest, because weather half the time reads as weather all the time |
| **The road** | `game-scene/road-curve.ts` — two sine waves of different lengths, so the bends never quite repeat. A quarter of runs are straight, deliberately: variety needs a baseline |

**Weather and the curve are drawing tricks, and must stay that way.** Rain does not shorten
a deadline and a bend does not move a lane. The curve is applied last, in the scene, to
*everything at once* — road, markings, kerbs, scenery, traffic, coins, crates, opponents,
badges — by the same `shiftAt(depthAhead)`. Nothing's relationship to anything else changes,
which is exactly why it is safe. `shiftAt(0)` is zero: the road bends away from the player
rather than the player sliding along a fixed curve.

`game-scene/curve-state.ts` is module state, written in exactly one place — `Driver`, at
`useFrame` priority `-1`, before anything reads it. Its header says why nine components share
two numbers instead of being handed them as props.

### The six places

Every map used to be the same map in a different colour: the palette changed the sky and the
tarmac, and then the scene drew the identical row of boxes down each side and the identical
cars beside them. Colour is not a setting — a forest is not a city with green buildings.

`game-scene/biome.ts` says what a map is *made of*: what stands beside the road, what moves on
the outer tracks, and the one large thing it has that no other map has.

| Map | Roadside | Outer tracks | Landmark |
|---|---|---|---|
| 1 Neighborhood Dash | buildings, windowed | cars | — |
| 2 Forest Valley | pines, trunk and canopy | deer and boar | waterfalls |
| 3 Desert Canyon | mesas with a harder cap | camels and ostriches | buttes |
| 4 Harbour Docks | container stacks | lorries and cars | gantry cranes |
| 5 Night Highway | towers, lit | cars | — |
| 6 Volcano Ridge | obsidian spires, lit collars | rolling rock | lava flows |

The rebrand went all the way down: map names, briefing text, themed vocabulary and the secret
sentences were all rewritten with the themes. A nature map still called Downtown Sprint that
hands the player `taxi` reads as a bug, because it is one.

**It is still only drawing.** A deer and a lorry are the same zero metres of anything the
player can touch, the scenery pool is the same fixed size on all six maps, and
`scene-pools.test.ts` asserts that — so a richer biome can never become a slower one. Parts
name their colours (`structureA`, `structureB`, `accent`) rather than carrying literals, which
is what lets the weather tint a map without `biome.ts` knowing weather exists.

Two things fell out of the rework and are worth keeping straight:

- **`skyKind` is stated, not inferred.** `Sky.tsx` used to call a map "night" when its light
  dropped below 0.8 — but weather dims that number, so an overcast afternoon could be drawn as
  midnight, and the volcano (a *daytime* map lit through ash) had no way to ask for the sky it
  needed. It is now `'day' | 'night' | 'ash'` on the palette.
- **Road furniture is per-biome.** Reflector posts and overhead gantries are drawn on the three
  tarmac maps only. A motorway gantry over a canyon track reads as a copy-paste, and it was one.
  They are `visible={false}` off those maps, not merely un-updated: skipping the placement loop
  leaves every instance on its identity matrix, which is a one-metre cube at the origin — and the
  origin is where the player is standing. That is the brown box that appeared under the runner.
- **Animals are modelled nose-first and then turned around.** The group they sit in is oriented
  for vehicles, whose front works out to `-z`, so an animal built the obvious way galloped down
  the road backwards on every same-direction track. They also run at half the vehicle speeds:
  a deer closing at the car rate is a deer doing seventy miles an hour, and it looked it.

### Where the new work lives

- `game-core/motion/momentum.ts` — speed as a level, and why it is not a timer.
- `game-core/pursuit/tuning.ts` — `neutralMarginFor(map)`. The difficulty ladder, as arithmetic.
- `game-core/flow/flow-word.ts` — `flowBufferFor(map)`. The other half of the same ladder.
- `game-core/timing/lane-reserve.ts` — the road a coin swerve needs. Replaced `motion-reserve.ts`.
- `components/hud/pace.ts` — the pace bands and their dead band.
- `game-scene/lighting.ts` — why one fixed shadow camera is enough, and why the hemisphere
  light is not optional.
- `game-scene/textures.ts` — procedural asphalt and glow, painted rather than downloaded.
- `game-scene/Sky.tsx` — drei `<Sky>`/`<Stars>` are asset-free; **`<Cloud>` is not**.
- `game-scene/runner/` — the rig, the pure gait function, and the assembly.
- `game-scene/AmbientTraffic.tsx` — the speed cue that replaced oncoming hazards.
- `game-scene/road-curve.ts` + `curve-state.ts` — the bend, and the one place it is written.
- `game-scene/biome.ts` — what each map is built out of, and why it is not a palette.
- `game-scene/Landmarks.tsx` — waterfalls, buttes, cranes and lava; why they are not scenery.
- `game-scene/weather.ts` + `WeatherLayer.tsx` — the sky, and the instanced particle field.
  The component is `WeatherLayer` rather than `Weather` because `./Weather` and `./weather`
  are the same module on a case-insensitive filesystem.

### Tuning, as measured

`map-progression.test.ts` states each map as three assertions, over 24 seeds each:

- a perfect typist at the advertised speed finishes **100%**;
- one at **85%** of it finishes **100%** — the tolerance band;
- one at **75%** of it finishes **0%**.

All six pass. A word is on screen **85–95%** of the run, and the map's sentence is finished.

**The lever that made this work was the word budget, not the chaser.** Chaser numbers alone
could not separate 0.85 from 0.75 — the margins they produce are close, and a run is a few
dozen words rather than an infinite sample, so variance dominated. Setting each map's flow
buffer inside `(1/0.85, 1/0.75)` turns the gate crisp: inside the band nothing lapses,
below it everything does. `content/pace.test.ts` proves that per map × word, as a table.

### Known limits

- **Progress survives a reload** (plan 2.1). `IndexedDbStorage` is the default;
  `InMemoryStorage` is the fallback.
- **Adaptive assistance was re-keyed to lapsed words.** It used to trigger on missed
  hazards, which meant that after this rework it could never have fired at all.
- **Flight no longer waives anything**, because there is nothing to waive. It still lifts
  the runner and still suppresses the gait.
- **`mistakeBehavior` and `caseSensitive`** are stored and displayed but not read by the
  typing engine.
- **The prompt is HTML, not 3D text.** drei's `<Text>` fetches a font from a CDN and this
  project ships no remote assets; `game-scene/README.md` sets out the trade.
- **Shadow cost is unmeasured by CI.** `docs/performance.md` disclaims GPU time, so the
  60fps claim rests on a manual check rather than on a test.

### Health at this checkpoint

All green, verified by running them:

```bash
npm run test          # 1041 passed, 69 files
npm run test:e2e      # 16 passed, Chromium against the production build
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
      reset. Progress reset on reload at the time; the IndexedDB implementation the
      interface was a seam for arrived later, in plan 2.1.

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
