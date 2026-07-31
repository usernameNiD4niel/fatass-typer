# `game-core` — pure rules

The deterministic heart of the game. Everything here is plain TypeScript.

## Contract

- **No DOM.** No `window`, `document`, `navigator`, `localStorage`, `requestAnimationFrame`,
  `performance`, timers, `fetch`.
- **No React.** No renderer, bridge, storage, component, or screen imports.
- **No wall-clock reads.** Time arrives as a parameter. Never call `Date.now()`.
- **No randomness.** Randomness arrives as a seeded generator (step B8).
- Same inputs always produce the same outputs.
- Every module here ships unit tests.

These rules are enforced by ESLint (`eslint.config.js`, the `src/game-core/**` block),
not by convention alone.

## Why

This is the boundary a Rust + WebAssembly implementation would replace wholesale if the
project ever moves the simulation off TypeScript. Anything that leaks a browser API into
this folder makes that swap impossible and makes the rules untestable in isolation.

## Contents

Populated by phase B: types, typing comparison, WPM and accuracy, sustainable peak WPM,
prompt timing, chase distance, scoring, seeded prompt selection. See CLAUDE.md §5.
