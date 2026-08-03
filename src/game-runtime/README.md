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

- `render/` — the canvas scaffold. `camera.ts` (pure meters↔pixels, side-scroll clamping),
  `parallax.ts` (depth-scrolled tiling layers), `palette.ts` (one scene palette per map
  theme), `canvas-surface.ts` (HiDPI sizing + the narrow `Canvas2D` interface the renderer
  draws through), `scene-renderer.ts` (`drawScene`, `groundYPx`), and `canvas-renderer.ts`
  (`CanvasRenderer`, the one stateful object — owns the element, camera, and palette).
- `actors/` — the characters. `mc-animation.ts` is the MC's animation state machine (idle,
  running, boosting, jumping, sliding, sidestepping, stumbling, hit, victory, caught) —
  pure, with interrupt priorities so a
  collision can cut a jump short but never the reverse. `animationForMove` maps the move
  `game-core` names onto a pose; each avoidance move gets a distinguishable one, so the
  player can tell which one the game credited them with.
  `mc-renderer.ts` draws him from vector shapes in body units, so `heightPx` is the only
  dial and a sprite sheet can replace the file wholesale. `dog-pack.ts` turns the chase
  model's single gap number into three animals; `dog-renderer.ts` draws them with danger
  cues that escalate with `chaseThreat`.
- `session/` — the run. `run-session.ts` is the whole simulation as pure functions: time
  arrives as deltas, randomness from a seed, and every call returns a new session plus its
  events, so a full run can be played out in a test without rendering a frame.
  `runtime-host.ts` is the impure half — it owns the loop, the renderer, and the clock, and
  implements the bridge's `GameHost`.

Obstacles share the typing field with boost prompts: an obstacle prompt is mandatory and
takes the field the moment it attaches, a boost prompt is optional speed. Completing either
is the same keystrokes, so one input path handles both and `promptObstacleId` decides what
the completion means. Consequences — chase distance, combo, score, run statistics — are
applied in one place (`applyResolution`), so a new outcome cannot be added and silently
forgotten by one of the four.

`obstacle-renderer.ts` draws them: one silhouette per definition, sized in world meters so
they scale with the camera. An approaching obstacle carries a warning chevron; once its
prompt attaches, that becomes a deadline bar whose **length and colour both** shrink, so the
urgency survives colour-blindness (spec §12).

`session/playtest-harness.ts` plays a whole run at an exact, metronomic speed, optionally
mistyping and correcting at a fixed rate. It is how the maps are tuned (step F2): playtesting
a typing game by hand measures the tester, and a throttled or occluded browser tab runs the
loop at a fraction of real time. `map-1-playtest.test.ts` uses it to state Map 1's difficulty
as assertions — a 20 WPM typist finishes even while making mistakes, a 10 WPM typist is
caught — so changing a chase number tells you immediately what it cost.

- `assets/` — the asset manifest. Every asset path in the game is declared here and
  nowhere else; nothing builds a path by concatenation. All entries are currently
  `optional`, because the scene is drawn from vector shapes (spec §10 permits this for the
  first implementation) — the manifest exists so real art can land without a refactor.

Canvas colour comes from `render/palette.ts`, keyed by map theme. It is deliberately not
wired to the light/dark design tokens: the scene is themed by the map, the UI by the user's
setting.

Testing the renderer: `src/test/fake-canvas.ts` provides a recording `Canvas2D` stub. jsdom
has no 2D context, and the narrow interface exists so tests can assert on draw calls.

There is one chase, not three. The dogs' positions are derived from `ChaseState` on the
frame they are drawn, so the picture and the HUD number cannot disagree. Nothing in
`actors/` can change the gap or decide a catch.

Animation never drives the world. The run cycle advances by distance travelled, so speed
comes from the rules and the legs follow — never the other way round (CLAUDE.md §5).

See CLAUDE.md §5 for what remains.
