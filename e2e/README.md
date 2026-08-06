# `e2e/` — Playwright

What only a real browser can tell you: that the scene got a **WebGL** context,
that React Three Fiber's render loop is driving the simulation, that the lazily
loaded chunks actually arrive, and that a keystroke typed at the window reaches
the game. Everything below this layer has unit tests; none of them can answer
those.

```bash
npx playwright install chromium   # once
npm run test:e2e
npm run test:e2e:ui               # watch it happen
```

The suite runs against the **production build** — `playwright.config.ts` builds
and previews it — because code splitting and Suspense boundaries only exist
there.

## WebGL in CI

Headless Chromium has no GPU, and it will not fall back to SwiftShader for WebGL
unless told to. `playwright.config.ts` passes the flags that tell it to.

`webgl.spec.ts` exists so that when those flags stop working the failure says
"no WebGL" rather than "the canvas was blank", which is a far longer afternoon.
It creates a context, clears it to a known colour, and reads the pixel back — a
context that reports success but renders nothing is the failure mode worth
catching.

## Two rules the specs follow

- **Query by role and accessible name, never by CSS class.** A test that breaks
  when a class is renamed tests the stylesheet; a test that breaks when a button
  loses its name tests something worth knowing.
- **Type what is on screen.** Words come from a seeded pool, so asserting on a
  particular one would be asserting on the seed. Since the word is drawn in
  WebGL, the specs read it from the visually-hidden label — which exists exactly
  so that something other than a pair of eyes can find it.

`navigation.spec.ts` covers getting around by keyboard alone. `run.spec.ts`
covers a run: starting it, confirming there is no typing box, typing a word to
finish a word, pausing with Escape, restarting with Ctrl+Enter, quitting, and
crashing.

## Manual QA checklist

Automated tests do not watch the screen. Before shipping a change to the run,
walk this once:

| Check                | Looking for                                                        |
| -------------------- | ------------------------------------------------------------------ |
| Start a run          | Road, runner, buildings and passing traffic; speed climbs off zero |
| The first word       | On screen immediately; the next replaces it the moment it is done  |
| Type it              | Characters light up in order; the pace bar turns green             |
| First coin line      | Word with an arrow and a lane glow; typing it swerves you across   |
| Ignore a coin line   | You drive past; score, combo and the chaser are all unchanged      |
| Lighting             | The runner casts a shadow that tracks their feet; no shadow acne   |
| Runner               | Knees and elbows bend; arms swing opposite the legs                |
| Wrong character      | Marked in place, combo resets, run continues                       |
| Let words lapse      | The chaser closes, then the results screen says "Caught"           |
| `Esc`                | Everything freezes mid-move; resume loses no deadline time         |
| `Ctrl`/`Cmd`+`Enter` | Fresh run from zero, wherever focus is                             |
| Resize the window    | Scene reflows; no stretching, no letterboxing                      |
| Switch tabs mid-run  | Run pauses; returning does not skip the world forward              |
| Reduced motion       | Scenery holds still, camera stops leading; the road still moves    |
| Finish a map         | Results screen, unlock message, best scores recorded               |
