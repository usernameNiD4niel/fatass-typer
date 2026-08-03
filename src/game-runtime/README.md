# `game-runtime` — loop and renderer

Owns the fixed-timestep simulation loop, the Canvas 2D renderer, sprites, camera,
parallax, and the per-frame work.

## Contract

- **No React imports.** Enforced by ESLint.
- Game rules are not implemented here. The runtime calls into `game-core` and renders
  the result.
- Talks to the UI only through `game-bridge`. It never reaches into React state.
- All per-frame allocation stays inside this layer. Nothing at 60Hz crosses the bridge.

## Contents

- `loop/` — `drainAccumulator` (pure fixed-timestep arithmetic) and `GameLoop`, the frame
  driver. The clock and the frame scheduler are injected via `LoopScheduler`, so tests
  crank frames by hand instead of waiting on real time; `browserScheduler` is the
  production one (`performance.now` + `requestAnimationFrame`).

The simulation advances in constant 60Hz steps and the renderer gets an interpolation
`alpha`, so the rules stay frame-rate independent. Two clamps protect the loop: a maximum
frame length (a backgrounded tab reports a 60-second frame) and a maximum step count per
frame (the spiral of death). Clamped time is dropped, never banked, and reported through
`stats.droppedMs`. Callers must call `stop()` on unmount — a leaked rAF chain renders into
a detached canvas forever.

Still to come in phase C: canvas scaffold, MC animation state machine, dog rendering.
Obstacle rendering follows in phase D. See CLAUDE.md §5.
