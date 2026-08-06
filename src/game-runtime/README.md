# `game-runtime` — the simulation

Owns the run: the fixed-timestep loop, the words, the coins and crates, and the
world snapshot the scene reads. It does **not** draw. Drawing is `game-scene`.

That split is new. The runtime used to own a Canvas 2D renderer as well, and
when the scene moved to Three.js the drawing went with it — leaving this layer
as what it always should have been: the thing that decides what is true, once
per simulation step, with no opinion about pixels.

## Contract

- **No React imports, and no Three.js imports.** Enforced by ESLint.
- Game rules are not implemented here. The runtime calls into `game-core` and
  applies the result.
- Talks to the UI only through `game-bridge`. It never reaches into React state.
- Nothing at 60Hz crosses the bridge as an _event_. Per-frame state goes into the
  `WorldSnapshot` instead, which React never subscribes to.

## Contents

- `loop/` — `drainAccumulator` (pure fixed-timestep arithmetic) and
  `FixedStepDriver`, which turns frame deltas into fixed steps.

  Note what the driver is not: it owns no `requestAnimationFrame` and no clock.
  Something else decides when a frame happened and tells it how long that frame
  was — and that something is now React Three Fiber's `useFrame`, which is
  already running a render loop. Two rAF chains driving one game means the
  simulation and the scene are permanently half a frame out of step, and the
  interpolation alpha becomes a polite fiction.

  The simulation advances in constant 60Hz steps regardless, so the rules stay
  frame-rate independent. Two clamps protect it: a maximum frame length (a
  backgrounded tab reports a 60-second frame) and a maximum step count per frame
  (the spiral of death). Clamped time is dropped, never banked.

- `session/run-session.ts` — the run itself, as pure rules. No clock, no
  randomness beyond a seed, no DOM. Time arrives as deltas and every call
  returns a new session plus the events it produced, which is what lets the
  whole game be tested without rendering a frame.

  It holds the player's `PlayerMotion`, what is on the road, the score, the
  statistics, and the phase. `advanceRunSession` is the single step: decay the
  boost, move the player, advance the motion, spawn what is due, run every
  word's clock, then check the chaser and the finish line.

- `session/runtime-host.ts` — the impure boundary. Translates bridge commands
  into rules calls and session events into bridge events, and rewrites the
  `WorldSnapshot` in place once per frame.

- `session/playtest-harness.ts` — a metronomic simulated typist. Playtesting a
  typing game by hand measures the tester; this is what lets
  `map-progression.test.ts` state each map's difficulty as an assertion.

- `session/profile-harness.ts` — the same idea for frame cost. See
  `docs/performance.md`.

## Two channels out, because the game speaks at two rates

Events are coarse and throttled to ~10Hz: a prompt changed, a coin collected,
the run ended. React re-renders on these, so there must not be many.

The snapshot is per-frame and lives in `game-bridge/snapshot.ts`. It is one
object, mutated in place, holding everything the scene needs to draw: where the
player is, how far off the ground, what is on the road, what the
current challenge is. React never sees it.
