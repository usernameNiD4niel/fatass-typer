# Typing Chase

A desktop typing game. A heavy-set runner pounds down the road with three dogs
closing behind him; typing the prompt on screen makes him faster, and obstacles
carry prompts that have to be finished before he reaches them. Six maps, from a
20 WPM neighbourhood jog to a 50 WPM sprint.

Web app, keyboard required, minimum width 1024px. Mobile is out of scope.

```bash
npm install
npm run dev        # http://localhost:5173
```

## Playing

| Key                    | Does                                                 |
| ---------------------- | ---------------------------------------------------- |
| any printable key      | types the prompt                                     |
| `Backspace`            | corrects — a fixed mistake still counts as a mistake |
| `Esc`                  | pause, and resume                                    |
| `Ctrl`/`Cmd` + `Enter` | restart the run                                      |
| `Tab`                  | reaches every control, including locked map cards    |

Boost prompts are optional speed. Obstacle prompts are not: miss one and the
runner stumbles or hits it, and the dogs gain ground. Reach zero gap and the run
is over.

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

React 19 + TypeScript (strict) + Vite, Canvas 2D for the scene, plain CSS
modules driven entirely by design tokens. Vitest and Testing Library for units
and components; Playwright for the desktop keyboard flows.

```
src/
├── game-core/      pure rules — no DOM, no React, no canvas, no clock
├── game-runtime/   canvas renderer + fixed-timestep loop
├── game-bridge/    command-in / event-out seam between the two worlds
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
- **Per-frame data never reaches React.** The loop runs at 60Hz; the bridge
  coalesces what React sees to about 10Hz. A component that re-rendered per
  frame would cost more than the simulation does.
- **Typing compares whole input values**, not key events, so paste, backspace,
  and IME composition all behave.
- **No raw values in components.** `src/styles/tokens.css` is the only place a
  colour, radius, or duration is written down.

Each layer folder carries a `README.md` stating its own contract.

## Documentation

| Where                                | What                                                        |
| ------------------------------------ | ----------------------------------------------------------- |
| `CLAUDE.md`                          | the build plan, its 41 steps, and the current state of play |
| `claude_typing_chase_game_prompt.md` | the original specification                                  |
| `docs/performance.md`                | measured frame cost, bundle sizes, asset recommendations    |
| `src/*/README.md`                    | per-layer contracts                                         |

## Known limits

- **Progress does not survive a reload.** `StorageAdapter` is the seam for a
  real implementation; the only one today keeps everything in memory.
- **Adaptive assistance is dormant** — implemented and wired, but it triggers on
  missed obstacles, and a player missing obstacles has already been caught.
  `src/game-core/assistance/README.md` explains the reasoning.
- **`mistakeBehavior` and `caseSensitive` settings are stored and displayed but
  not yet read by the typing engine.**
- The canvas is not screen-reader playable. Everything around it is, and the run
  narrates its own moments through a live region.
