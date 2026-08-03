# Performance — measured, not asserted

Spec §16, build step G3. Everything below was produced by running the code, on
2026-08-03. Re-running the numbers is one command:

```bash
npm run build           # bundle sizes
npm run test -- src/game-runtime/session/performance.test.ts
```

Machine: Intel Core Ultra 7 255HX, 20 cores, Node v24.12.0, Windows 11.

---

## 1. Frame cost

`src/game-runtime/session/profile-harness.ts` drives the real `RuntimeHost` at
exactly 60Hz of simulated time through a context that counts draw calls instead
of rasterising them, with a metronomic typist at each map's target WPM so the
run reaches its finish line rather than being caught in the first eight seconds.

Measuring this in a browser measures the browser: an automated Chrome window is
throttled to a fraction of a frame per second, and the numbers that come back
describe Chrome's scheduler, not this code. So the loop is driven by hand.

Each row is a complete run of the map.

| Map   | Frames | ms/frame | Draw calls/frame | Peak frame | Bridge events | Metres |
| ----- | ------ | -------- | ---------------- | ---------- | ------------- | ------ |
| map-1 | 2272   | 0.010    | 288              | 306        | 23            | 320    |
| map-2 | 2363   | 0.005    | 289              | 312        | 28            | 360    |
| map-3 | 2329   | 0.004    | 291              | 310        | 29            | 400    |
| map-4 | 2405   | 0.003    | 290              | 310        | 31            | 440    |
| map-5 | 2175   | 0.003    | 290              | 310        | 28            | 440    |
| map-6 | 2354   | 0.003    | 291              | 310        | 34            | 520    |

**What this says.** Simulation plus scene assembly costs about **0.003–0.010ms**
of a 16.67ms frame — three to six thousandths of the budget. The first map reads
highest only because it runs first and pays for JIT warm-up.

**What this does not say.** It does not measure rasterisation, which belongs to
the GPU. The scene is flat filled shapes on a 1024×448 surface with the device
pixel ratio capped at 2 (`MAX_DEVICE_PIXEL_RATIO`), which is about as little as
a 2D canvas can be asked to do, but "60 FPS on your laptop" is a claim only a
real browser can settle.

**Draw calls are the durable number.** ~290 per frame, flat across the whole run
and across all six maps. That flatness is the actual result: obstacles are culled
off-screen (`isVisible`) and forgotten once resolved, and the parallax bands tile
to the viewport rather than to the map, so the last minute of a map costs what
the first minute costs. `performance.test.ts` pins this — a scene that started
accumulating would fail the "costs the same at the end as at the start" case.

## 2. React is not in the frame loop

The bridge coalesces live stats to ~10Hz and drops everything in between, so a
60Hz loop produces about six React updates a second, not sixty. The profiler
counts the offers the host makes (one per fixed step) separately from the events
that leave the bridge; the tests assert that a frame never pushes anything at
React on its own, and that bridge events stay a small fraction of frames — they
are things that _happen_ (a prompt, a warning, a resolution), not things that are
true every frame.

Per-frame state that React must never see — MC animation phase, dog cycle phase,
interpolated position — lives in the host as mutable fields, not in component
state.

## 3. Bundle and first load

After code splitting (`vite.config.ts` + `lazy()` in `App.tsx`):

| Chunk                              | Raw      | gzip    | When it loads      |
| ---------------------------------- | -------- | ------- | ------------------ |
| `vendor`                           | 193.7 kB | 60.5 kB | first load         |
| `index` (app shell, menu, content) | 42.1 kB  | 12.8 kB | first load         |
| `index.css`                        | 18.0 kB  | 3.6 kB  | first load         |
| `GameScreen` (+ the whole runtime) | 60.9 kB  | 20.2 kB | entering a run     |
| `SettingsScreen`                   | 6.2 kB   | 2.3 kB  | opening settings   |
| `RunResults`                       | 3.7 kB   | 1.5 kB  | finishing a run    |
| `MapSelection`                     | 2.9 kB   | 1.3 kB  | choosing a map     |
| `StatisticsScreen`                 | 2.8 kB   | 1.1 kB  | opening statistics |
| `LevelBriefing`                    | 2.4 kB   | 1.0 kB  | before a run       |
| `Modal`                            | 1.9 kB   | 1.0 kB  | first dialog       |
| `Tutorial`                         | 1.6 kB   | 0.9 kB  | first visit        |

**First load is ~77 kB gzipped**, down from a single 98 kB bundle — the runtime,
the canvas renderer, and every screen past the menu now arrive when they are
first needed. The splash, main menu, and width guard stay eager on purpose: a
loading line in front of the menu costs more than the bytes it saves.

Splitting is by dependency rather than by route for the vendor chunk, so a
gameplay change does not invalidate ~190 kB of everyone's cache.

## 4. Loading progress

`SplashScreen` reports progress as a labelled `progressbar` _and_ as text, and
`ScreenFallback` covers the gap while a lazy chunk arrives — announced politely,
with no animation, because these chunks usually arrive within a frame or two and
a spinner that flashes for 16ms is worse than nothing.

## 5. Assets

There are none. Every character, dog, obstacle, and background band is drawn from
vector primitives, and every entry in the asset manifest is optional. Nothing is
downloaded, decoded, or atlased, which is why there is no loading time to report.

**When real art arrives**, the recommendations are:

- One sprite atlas per theme rather than per-entity files: six maps × several
  actors is a lot of requests, and the draw call count above is already the
  cheap part.
- WebP or AVIF with PNG fallback; lossless for flat art, quality ~80 for
  anything shaded.
- Power-of-two atlas dimensions, trimmed transparent margins, and a JSON frame
  map generated at build time rather than hand-written.
- Preload only the atlas for the map about to be played — the manifest is
  already per-theme, and `SplashScreen` already reports pending-asset counts.
- Keep audio synthesised. It costs nothing to ship and nothing to decode.

## 6. Not applicable

The spec's WebAssembly items — Rust release profile, `wasm-opt`, WASM
initialisation failure handling — do not apply to this build. CLAUDE.md §2
replaced the Rust + Bevy runtime with TypeScript. `game-core` is kept pure and
DOM-free so that swap stays possible; if it happens, this section is where its
numbers belong.
