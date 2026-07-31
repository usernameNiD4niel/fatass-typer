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

Populated by phase C: fixed-timestep loop, canvas scaffold, MC animation state machine,
dog rendering. Obstacle rendering follows in phase D. See CLAUDE.md §5.
