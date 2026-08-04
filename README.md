# Typing Chase

A desktop typing game. You run down a three-lane road and the road puts things
in your way. A car blocks your lane and a word appears on the open side — type
it and you pull into that lane. A barrier blocks it and the word sits above —
type it and you jump. Miss either and the run is over. Six maps, from a 20 WPM
neighbourhood jog to a 50 WPM sprint.

Web app, keyboard required, minimum width 1024px. Mobile is out of scope.

```bash
npm install
npm run dev        # http://localhost:5173
```

## Playing

| Key                    | Does                                                 |
| ---------------------- | ---------------------------------------------------- |
| any printable key      | types the word — there is no box to click first      |
| `Backspace`            | corrects — a fixed mistake still counts as a mistake |
| `Esc`                  | pause, and resume                                    |
| `Ctrl`/`Cmd` + `Enter` | restart the run                                      |
| `Tab`                  | reaches every control, including locked map cards    |

There is no typing field. The keyboard is captured while a run is going and the
word lives out in the world, beside the hazard it applies to.

Typing is forgiving _within_ a word: a wrong character breaks your combo, not
your run, and you can correct it. What is not forgiving is the hazard. Finish the
word before the deadline or you hit the thing — and one hit ends the run.

Finishing a word does not save you by itself; it _starts_ the move. The lane
change or the jump still has to complete before you reach the hazard. The game
places every hazard far enough away for that to be true — see
`src/game-core/timing/motion-reserve.ts`.

## Commands

```bash
npm run dev            # dev server
npm run build          # tsc --build && vite build
npm run preview        # serve the production build
npm run typecheck      # tsc --build --force
npm run test           # Vitest, single run
npm run test:watch     # Vitest watch mode
npm run test:coverage  # Vitest + v8 coverage
npm run test:e2e       # Playwright, against the production build
npm run test:e2e:ui    # Playwright UI mode
npm run lint           # ESLint
npm run format         # Prettier write
npm run format:check   # Prettier check
```

`npm run test:e2e` builds the app and serves it before running; the first run
needs `npx playwright install chromium`.

## How it is built

React 19 + TypeScript (strict) + Vite, Three.js through React Three Fiber for
the scene, plain CSS modules driven entirely by design tokens. Vitest and
Testing Library for units and components; Playwright for the desktop keyboard
flows.

Everything in the scene is built from primitive geometry — boxes, planes, a
cone. No models, no textures, no fonts, no remote assets of any kind.

```
src/
├── game-core/      pure rules — no DOM, no React, no renderer, no clock
├── game-runtime/   the simulation: fixed timestep, hazards, the run
├── game-bridge/    the seam — commands in, events out, world snapshot
├── game-scene/     Three.js: the road, the runner, the hazards, the word
├── audio/          synthesised cues, music, and the danger layer
├── storage/        StorageAdapter interface + in-memory implementation
├── content/        maps, obstacles, and every prompt
├── components/     UI primitives and the run HUD
├── screens/        full-screen views
├── hooks/          React bindings onto game-core
└── styles/         design tokens, global CSS
```

Four things are worth knowing before changing anything:

- **`game-core` is pure.** No DOM, no React, no `Date.now`, no `Math.random`.
  Randomness is seeded and threaded as data, so the same seed replays the same
  run. ESLint enforces this, not convention — `npm run lint` fails on a breach.
- **Per-frame data never reaches React.** The simulation runs at 60Hz and the
  scene reads it through a `WorldSnapshot` that React never sees; the bridge
  coalesces what React _does_ see to about 10Hz. A component that re-rendered
  per frame would cost more than the simulation does.
- **The easing lives in the rules, not in the scene.** Whether a lane change
  finished before the car arrived is a question about the curve, so
  `game-core/motion` owns it and the scene only draws it.
- **Typing compares whole input values**, not key events, so paste, backspace,
  and IME composition all behave.
- **No raw values in components.** `src/styles/tokens.css` is the only place a
  colour, radius, or duration is written down.

Each layer folder carries a `README.md` stating its own contract.

## Documentation

| Where                                | What                                                     |
| ------------------------------------ | -------------------------------------------------------- |
| `CLAUDE.md`                          | the build plan and the current state of play             |
| `typing_runner_claude_prompt.pdf`    | the three-lane rework brief                              |
| `claude_typing_chase_game_prompt.md` | the original specification                               |
| `docs/performance.md`                | measured frame cost, bundle sizes, asset recommendations |
| `src/*/README.md`                    | per-layer contracts                                      |

## Known limits

- **Progress does not survive a reload.** `StorageAdapter` is the seam for a
  real implementation; the only one today keeps everything in memory.
- **Adaptive assistance is effectively off** — implemented and wired, but a
  missed hazard now ends the run, so there is rarely a second failure for it to
  react to. `src/game-core/assistance/README.md` explains the reasoning.
- **`mistakeBehavior` and `caseSensitive` settings are stored and displayed but
  not yet read by the typing engine.**
- The scene is not screen-reader playable. Everything around it is: the run
  narrates its moments through a live region and names each word as it appears,
  and a hidden label holds the current word so it can be re-read on demand.
