# `game-core/obstacles` — scheduling and the fairness promise

Pure rules. No clock, no randomness beyond the seeded RNG, no DOM.

## Contents

- `spawner.ts` (D1) — _when_ an obstacle appears and _which_ one. Seeded, jittered, driven
  entirely by the map's `ContentProfile`. Returns a list, because a long frame can cross
  more than one due time and dropping the extras would quietly make the map easier.
- `active-obstacle.ts` (D2) — an obstacle placed in a run: where it sits, when its prompt
  attaches, and when the deadline expires.

## The promise

**The prompt is on screen early enough that a player typing at the map's stated target
speed can finish it before impact.** Placement is derived from the B5 timing budget for
exactly this reason — a fixed spawn distance would demand a different WPM on every map, and
the displayed target would become a lie (spec §6). `active-obstacle.test.ts` asserts it for
every obstacle-and-prompt combination Map 1 can produce.

## Three moments

1. **Warning** — the obstacle is visible, with no prompt yet. `WARNING_LEAD_FACTOR` buys
   the look-ahead; it does _not_ add typing time, so the required WPM is unchanged.
2. **Prompt attached** — time to impact has fallen to the available budget. The deadline is
   frozen here and never moves again: recomputing it per frame would let a boost eat the
   player's own slack, so going faster would shorten the deadline it created.
3. **Deadline** — impact reached with the prompt unfinished.

Each transition fires at most once, so a stalled frame that crosses two thresholds produces
one warning and one attachment rather than a burst.

Resolution — the avoidance animation, the collision, the consequences — is D3. Obstacles
marked `resolved` or `missed` are inert and never fire again.
