# `game-core/obstacles` — scheduling and the fairness promise

Pure rules. No clock, no randomness beyond the seeded RNG, no DOM.

## Contents

- `spawner.ts` (D1) — _when_ an obstacle appears and _which_ one. Seeded, jittered, driven
  entirely by the map's `ContentProfile`. Returns a list, because a long frame can cross
  more than one due time and dropping the extras would quietly make the map easier.
- `active-obstacle.ts` (D2) — an obstacle placed in a run: where it sits, when its prompt
  attaches, and when the deadline expires.
- `resolution.ts` (D3) — how it ends, and the guard that makes it end once.

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

## Three endings

Every obstacle reaches exactly one: **avoided** (prompt completed in time), **stumbled**
(deadline passed with at least half the prompt correct), or **hit** (deadline passed with
little or nothing typed). Splitting the failure in two matters — a player who nearly made it
was trying and ran out of road; charging them the same as someone who never engaged makes
the near-miss feel arbitrary.

`isResolvable` is the single double-resolution guard: only an `active` obstacle can end. A
late keystroke landing in the same step as the deadline, a duplicated event, or a re-entrant
call cannot award a second avoidance or charge a second collision. Completing a prompt after
the deadline does not rescue it — it becomes a stumble, since the text _was_ typed.

Notice the division of ownership: `active-obstacle.ts` sets `expired` when the deadline
passes but leaves `status` alone. Only resolution moves an obstacle to `resolved` or
`missed`. A status written from two places is a status nobody owns.

`moveForOutcome` names the move — the obstacle's own action on success, a stumble or an
impact on failure. It returns a name, not an animation: nothing in `game-core` knows what an
animation is. The runtime's `animationForMove` does the mapping.

The consequences of each ending — dog distance, combo, score, run statistics — are D4.
Obstacles marked `resolved` or `missed` are inert and never fire again.
