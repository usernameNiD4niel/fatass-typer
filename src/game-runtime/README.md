# `game-runtime` — loop and renderer

Owns the fixed-timestep simulation loop, the Canvas 2D renderer, the chase camera, the
actors, and the per-frame work.

The shot is a **behind-the-runner perspective view** down a straight track: the player
looks past the runner at what is coming, the pack chases into frame behind him, and
obstacles grow out of the vanishing point. It replaced a side-scrolling view, which put
the player's attention on the wrong half of the screen — in a game about reading a prompt
before something arrives, what is _ahead_ has to be the thing you can see.

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

- `render/` — the canvas scaffold. `perspective.ts` is the camera: a pure pinhole
  projection from world metres (`z` ahead, `x` across, `y` up) to the screen, with the
  near clip, the runner's place in the frame, and where the pack sits. `palette.ts` holds
  one scene palette per map theme, `canvas-surface.ts` the HiDPI sizing and the narrow
  `Canvas2D` interface everything draws through, `track-renderer.ts` the world (sky,
  horizon, track, markings, scenery, finish line), and `canvas-renderer.ts` the one
  stateful object — it owns the element, the view, and the palette.

  Two numbers in `DEFAULT_PERSPECTIVE` decide the whole look: `heightMeters` (how high the
  shot sits) and `runnerDistanceMeters` (how far ahead he is). Their ratio fixes where his
  feet land on screen; raising both together keeps the framing and makes him larger.

- `actors/` — the characters. `mc-animation.ts` is the MC's animation state machine (idle,
  running, boosting, jumping, sliding, sidestepping, stumbling, hit, victory, caught) —
  pure, with interrupt priorities so a
  collision can cut a jump short but never the reverse. `animationForMove` maps the move
  `game-core` names onto a pose; each avoidance move gets a distinguishable one, so the
  player can tell which one the game credited them with.
  `runner-renderer.ts` draws him from behind in body units, so one number resizes him and a
  sprite sheet could replace the file wholesale. While a boost is running he looks back over
  his shoulder and laughs at the dogs — the one moment his face is visible, and the only
  place the game's joke actually lands. `dog-pack.ts` turns the chase model's single gap
  number into three animals; `pack-renderer.ts` places them between the lens and the runner
  and escalates their colour with `chaseThreat`.

  The pack's depth is compressed rather than literal, and `packZ` explains why: a real
  sixteen-metre lead is behind the camera, and a chase nobody can see is just a timer. What
  is preserved is the direction — losing ground walks them _up_ the track towards him until
  they are level with him and the run is over.

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

`obstacle-course-renderer.ts` draws them coming down the track: a distinct silhouette per
action — a rock or crate to clear, an overhead sign to duck, a barrier to step around — plus
a coloured band on the ground in front of each. Shape carries the meaning and colour only
reinforces it (spec §12). Everything past the draw distance or behind the lens is culled,
which is what keeps a frame's cost flat from the first metre of a map to the last.

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
