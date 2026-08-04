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
reaches its finish line rather than crashing into the first hazard.

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
| Map 1, 20 WPM | 0.0020ms | 0.0059ms | 2.10ms  | 0.0060ms    | 0.0017ms   |
| Map 6, 50 WPM | 0.0015ms | 0.0040ms | 0.072ms | 0.0023ms    | 0.0018ms   |

Two things worth reading off that table.

**The cost is negligible** — around 0.01% of a frame. Whatever eventually limits
the frame rate, it will not be the rules.

**It does not grow.** The last third of a run costs what the first third did, on
both the shortest map and the longest. That is the number actually worth
watching, because a rising one is what a leak looks like from the outside.
`performance.test.ts` asserts the shape rather than the milliseconds, since a CI
runner's millisecond is not a laptop's.

The Map 1 maximum of 2.10ms is the first frame — module initialisation and the
first hazard's placement, once, before anything is on screen.

## Why it stays flat

- **One hazard at a time.** The spawner refuses to fire while another is
  unresolved, so the list the runtime walks is one long, not one per hazard the
  map has ever produced. Resolved hazards are forgotten.
- **The snapshot is mutated in place.** One object, one fixed-length hazard pool,
  reused every frame. A fresh snapshot per frame would be a steady stream of
  garbage in the hottest path in the program.
- **The scene allocates nothing per frame either.** Lane dashes and roadside
  buildings are fixed instanced pools, recycled by moving them; hazards are a
  fixed pool of groups that are shown and hidden rather than mounted.
- **React is not in the loop.** Per-frame state never reaches it; the bridge
  coalesces events to ~10Hz.

## Bundle

| Chunk              | Raw      | Gzipped  | When it loads  |
| ------------------ | -------- | -------- | -------------- |
| `index` (app)      | 41.2 kB  | 12.4 kB  | first paint    |
| `index` (shared)   | 11.5 kB  | 4.0 kB   | first paint    |
| `vendor` (React)   | 201.7 kB | 63.5 kB  | first paint    |
| `index.css`        | 18.2 kB  | 3.6 kB   | first paint    |
| `GameScreen`       | 45.0 kB  | 14.6 kB  | starting a run |
| `three`            | 864.9 kB | 233.2 kB | starting a run |
| Screens (7 chunks) | ~22 kB   | ~9 kB    | on navigation  |

**First load is ~83 kB gzipped.** Three.js is 233 kB on its own — nearly three
times everything else combined — and it sits behind a `lazy()` boundary on
`GameScreen`, so it arrives when a player actually goes to play rather than when
they open the menu. Keeping it there is the single most important performance
property of the build: if `GameScreen` ever stops being lazily imported, first
load quadruples.

The `three` chunk is over Rollup's 500 kB warning threshold and the warning is
expected. It is a library, it is cached across visits, and splitting it further
would only mean fetching the same bytes in more requests.

## Not covered

- **Rasterisation and GPU time.** See above.
- **Real device pixel ratios.** The canvas caps DPR at 2, so a 3× display costs
  4× the pixels rather than 9×.
- **Long-session memory.** Nothing accumulates by construction, and the flat cost
  curve is consistent with that, but no run measured here lasts an hour.
