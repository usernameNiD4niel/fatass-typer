# `game-scene` — the road, drawn

Three.js through React Three Fiber. Everything the player looks at during a run.

## Contract

- Reads the world through `game-bridge` only — the `WorldSnapshot` for per-frame
  state, nothing else. No `game-runtime` internals, no screens, no storage.
  Enforced by ESLint.
- **Draws. Does not decide.** Every position here comes from the snapshot, which
  is to say from `game-core`. This layer adds the run cycle, the lean into a
  turn, the landing squash, the camera drift — things that cannot change the
  outcome of a run.
- No allocation in `useFrame`. Pools are fixed at mount and recycled.
- Everything is primitive geometry. No models, no textures, no fonts, no remote
  assets of any kind.

## One render loop

`GameCanvas` mounts a `<Driver>` whose `useFrame` runs at priority `-1` — before
every other `useFrame` in the tree — and advances the simulation. Every mesh
below therefore reads a snapshot that is current _this_ frame rather than one
behind.

A second `requestAnimationFrame` chain of our own would be half a frame out of
step with R3F's forever, and the interpolation alpha would be a fiction. So
there is only this one.

## Why the easing is not here

The car encounter turns on one question: had the lateral move finished when the
collision plane arrived? That is a question about the easing curve. If the curve
lived in this layer the rules could not answer it — they would be guessing at an
animation they cannot see.

So `game-core/motion` owns `lanePosition()` and `jumpHeightMeters()`, and
`Player.tsx` multiplies them by lane width and apex height. One curve, two
consumers, no drift.

## Contents

- `GameCanvas.tsx` — the only module that mounts a WebGL canvas. Isolating it
  here is what lets the screen's own tests run in jsdom, which has no WebGL:
  they mock this file and assert on the HUD and the overlay.
- `Road.tsx` — the endless road. A fixed pool of lane dashes and roadside
  buildings, recycled: each frame every pooled object is wrapped modulo the pool
  length, with the seam placed _behind_ the camera. Recycle in front of it and
  the player watches buildings blink out of existence.

  The road surface itself never moves. It is featureless, so scrolling it would
  achieve nothing except eventually sliding it out of view; the dashes are what
  carry the sense of speed.

- `Hazards.tsx` — cars and jump barriers, from a fixed pool of groups holding
  both silhouettes. Hazards are never mounted mid-run: a hazard that pops into
  existence is a hazard that was not readable early.
- `Player.tsx` — the runner, from behind, in boxes.
- `WorldPrompt.tsx` — the word, the lane glow, and the arrow.
- `ChaseCamera.tsx` — smooth follow, a slight lead toward the safe lane, field of
  view with speed, and a brief shake on collision. All but the follow are
  disabled by reduced motion; the follow is not an effect, and without it there
  is no game to look at.
- `scene-config.ts` — geometry constants and one palette per map theme.

## Why the prompt is HTML and not 3D text

The obvious choice is drei's `<Text>`, and it is rejected for one concrete
reason: troika fetches its default font from a CDN, and this project ships no
remote assets. Bundling a font would fix that, at the cost of a binary asset and
a licence audit.

The overlay buys back more than it costs. Per-character styling is one span each
rather than two overlapping SDF meshes; the word inherits the app's font stack,
its type scale, and the player's prompt-size setting; high-contrast mode already
applies to it; and it is real text, so it is not invisible to everything except
eyes.

The usual objection — that projecting a DOM node jitters — is handled the way it
has to be: drei's `<Html>` writes transforms directly in the render loop, so
nothing here goes through React state per frame.
