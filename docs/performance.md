# Performance

Measured, not estimated. Re-measure with:

```bash
npm run test -- performance     # frame cost
npm run build                   # bundle sizes
```

## Why the numbers come from a harness and not a browser

Profiling this in a browser measures the browser. An automated window is
throttled to a fraction of a frame per second, and the numbers that come back say
more about Chrome's scheduler than about this code.

So `src/game-runtime/session/profile-harness.ts` drives the real host by hand at
exactly 60Hz of simulated time, with a metronomic typist fast enough that the run
keeps the chaser at bay rather than being caught in the first few seconds.

**What that measures honestly:** the simulation and the assembly of the
`WorldSnapshot` the scene reads — everything that happens before a single
triangle is submitted.

**What it does not measure:** anything on the GPU. That now belongs to Three.js,
and this harness is not entitled to speak for it. The one number below that
covers the scene at all is the bundle size.

## Frame cost

One frame's simulation and snapshot, over 3,600 frames (60 seconds of simulated
time). The budget for a whole frame at 60 FPS is **16.67ms**.

| Map           | Median   | p95      | Max     | First third | Last third |
| ------------- | -------- | -------- | ------- | ----------- | ---------- |
| Map 1, 20 WPM | 0.0023ms | 0.0073ms | 2.32ms  | 0.0128ms    | 0.0018ms   |
| Map 6, 50 WPM | 0.0018ms | 0.0044ms | 0.109ms | 0.0035ms    | 0.0018ms   |

Two things worth reading off that table.

**The cost is negligible** — around 0.01% of a frame. Whatever eventually limits
the frame rate, it will not be the rules.

**It does not grow.** The last third of a run costs what the first third did, on
both the shortest map and the longest. That is the number actually worth
watching, because a rising one is what a leak looks like from the outside.
`performance.test.ts` asserts the shape rather than the milliseconds, since a CI
runner's millisecond is not a laptop's.

The Map 1 maximum of 2.32ms is the first frame — module initialisation, once,
before anything is on screen.

## Why it stays flat

- **One thing on the road at a time.** A coin line or a crate waits for the last
  one to be done with, so the lists the runtime walks are a handful of entries
  long rather than one per encounter the map has produced. Spent ones are forgotten.
- **The snapshot is mutated in place.** One object, fixed-length pools, reused
  every frame. A fresh snapshot per frame would be a steady stream of garbage in
  the hottest path in the program.
- **The scene allocates nothing per frame either.** Lane dashes, kerb posts,
  gantries and roadside buildings are fixed instanced pools recycled by moving
  them; coins, crates and traffic are fixed pools of groups that are shown and
  hidden rather than mounted. `game-scene/scene-pools.test.ts` asserts the sizes
  are constants.
- **Textures are painted once and disposed.** The asphalt roughness map and the
  building facade are built in a `useMemo` and freed in the matching cleanup; the
  glow sprite is a module-level singleton shared by everything that glows, since
  every caller wants the identical 64×64 texture.
- **There is no post-processing pass.** The glow is additive billboards rather
  than bloom — see `game-scene/Glow.tsx` for what that trades away.
- **The gait is a pure function into a shared object.** `runner/gait.ts` fills one
  module-level pose rather than returning a literal — sixty allocations a second
  is exactly what this section exists to prevent.
- **React is not in the loop.** Per-frame state never reaches it; the bridge
  coalesces events to ~10Hz.

## Bundle

| Chunk              | Raw      | Gzipped  | When it loads  |
| ------------------ | -------- | -------- | -------------- |
| `index` (app)      | 41.2 kB  | 12.4 kB  | first paint    |
| `index` (shared)   | 11.5 kB  | 4.0 kB   | first paint    |
| `vendor` (React)   | 201.7 kB | 63.5 kB  | first paint    |
| `index.css`        | 18.2 kB  | 3.6 kB   | first paint    |
| `GameScreen`       | 57.9 kB  | 17.9 kB  | starting a run |
| `three`            | 874.3 kB | 236.5 kB | starting a run |
| Screens (7 chunks) | ~22 kB   | ~9 kB    | on navigation  |

**First load is ~84 kB gzipped.** The `three` chunk grew by 3.3 kB gzipped when
the sky arrived: drei's `<Sky>` pulls the Preetham shader in from `three-stdlib`.
That was the price of a horizon, and it was worth paying.

Three.js is 233 kB on its own — nearly three
times everything else combined — and it sits behind a `lazy()` boundary on
`GameScreen`, so it arrives when a player actually goes to play rather than when
they open the menu. Keeping it there is the single most important performance
property of the build: if `GameScreen` ever stops being lazily imported, first
load quadruples.

The `three` chunk is over Rollup's 500 kB warning threshold and the warning is
expected. It is a library, it is cached across visits, and splitting it further
would only mean fetching the same bytes in more requests.

## Not covered

- **Rasterisation and GPU time.** See above. This matters more than it used to:
  the scene now casts real shadows from a 1024² map and shades everything with
  physically based materials. Both were checked by hand at 1568×744 on an
  integrated GPU and held 60fps, but nothing in CI watches that number, and a
  regression here would not fail a test. `reducedMotion` halves the shadow map.
- **Real device pixel ratios.** The canvas caps DPR at 2, so a 3× display costs
  4× the pixels rather than 9×.
- **Long-session memory.** Nothing accumulates by construction, and the flat cost
  curve is consistent with that, but no run measured here lasts an hour.
