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

- `messages.ts` — the whole public surface: `GameCommand`, `GameEvent`, `GameState`, and the
  view models (`PromptViewModel`, `ObstacleViewModel`). Plain serialisable data only; no
  renderer type or canvas handle appears here, which is what makes the runtime swappable.
- `validate.ts` — `parseGameCommand(unknown)`. Returns a reason instead of throwing, so a
  malformed command becomes a `fatalError` event rather than an exception in the loop.
  Unknown properties are dropped, not forwarded.
- `bridge.ts` — `GameBridge`: validation, throttling, lifetime. The runtime attaches through
  `setHost`; React attaches through `subscribe`.
- `attach.ts` — `attachGame`, the **only** module that knows both sides exist. It is why
  React never imports `game-runtime`: a screen asks for a bridge attached to a canvas and
  gets back the same narrow object any runtime would hand it. Swapping in Rust + WASM means
  rewriting this file and nothing above it.

`GameState` is narrower than `game-core/app-state` on purpose. React owns navigation
(menus, settings); the bridge only reports what the run is doing.

**Throttling.** `publishStats` / `publishDogDistance` / `publishDeadline` can be called every
simulation step;
at most one update per 100ms leaves, and it is always the newest sample. A run-ending event
flushes the withheld sample first, so the final numbers are never 90ms stale. A timestamp
that jumps backwards resets the throttle — a restart puts run time back to zero, and
without that the HUD would freeze for the length of the previous run.

`deadlineChanged` is the one exception to the throttle: a **change of pressure level** goes
out immediately, whatever the window says. A countdown crossing into "critical" is the
moment the player most needs the HUD to react, and holding it back 90ms would be exactly
wrong. It is a separate event rather than a field on `LiveRunStats` because the deadline
exists only while an obstacle prompt is attached — folding a mostly-null field into every
tick would make the common case pay for the rare one.

**Lifetime.** `destroy()` clears every listener and turns all further calls into no-ops —
unmount ordering is not fully controllable, so a late event must be harmless. A throwing
listener is contained: one broken subscriber never stops the others or reaches the loop.
