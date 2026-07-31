# `game-bridge` — the seam between React and the runtime

A single stable object. Commands go in, events come out.

## Contract

- One narrow surface: `GameCommand` in, `GameEvent` out (spec §13).
- Messages are validated at the boundary. Nothing trusts the other side blindly.
- UI-facing updates are emitted at a fixed low frequency (~10Hz), **never per frame**.
- Listeners are cleaned up when the canvas unmounts.
- React imports the bridge. React never imports `game-runtime` internals.
- The bridge exposes no renderer types. Swapping the runtime must not change this API.

## Contents

Populated by step C5. See CLAUDE.md §5.
