# `game-core/obstacles` — scheduling, lanes, and the fairness promise

Pure rules. No clock, no randomness beyond the seeded RNG, no DOM.

## Contents

- `spawner.ts` — _when_ a hazard appears and _which_ one. Seeded, jittered, driven
  entirely by the map's `ContentProfile`.
- `lane-assignment.ts` — which lanes it blocks, and which one is the way out.
- `active-obstacle.ts` — a hazard placed in a run: where it sits, when its prompt
  attaches, when the deadline expires, and when the player reaches it.
- `resolution.ts` — how it ends, and the guard that makes it end once.

## Two promises

**The prompt is on screen early enough that a player typing at the map's stated
target speed can finish it before impact.** Placement is derived from the timing
budget for exactly this reason — a fixed spawn distance would demand a different
WPM on every map, and the displayed target would become a lie.

**And there is always a way out.** A car blocks the player's lane and nominates
exactly one adjacent lane as the answer; `isValidArrangement` can prove the
arrangement leaves a route. The PDF calls a blocked-everywhere encounter an
implementation bug, and `lane-assignment.ts` is where that bug is made
impossible rather than merely unlikely — ten thousand seeds, every starting lane,
in `lane-assignment.test.ts`.

`content/fairness.test.ts` checks both across every map × hazard × prompt the
game can actually produce. A playtest samples; that table proves.

## One hazard at a time

The spawner refuses to fire while any hazard is unresolved — or while the player
is going for a line of coins (`game-core/pickups`). That single gate
delivers three separate requirements for free: only one challenge active at a
time, hazards never overlap, and the safe lane stays open for the whole
avoidance window — because there is nothing else on the road that could close
it.

It also removes a class of bug the old list-returning spawner had to think
about. A long frame can no longer cross two due times and stack two hazards on
top of each other; the schedule catches up rather than piling up.

## Four moments

1. **Warning** — the hazard is visible, with no prompt yet. `WARNING_LEAD_FACTOR`
   buys the look-ahead; it does _not_ add typing time.
2. **Prompt attached** — time to impact has fallen to the budget _plus the
   reserve_. The deadline is frozen here and never moves again: recomputing it
   per frame would let a boost eat the player's own slack, so going faster would
   shorten the deadline it created.
3. **Deadline** — the word is unfinished and time is up. This is a failure, and
   it happens _before_ the collision plane, because the reserve put it there.
4. **Collision plane** — the player reaches the hazard. Whatever their body is
   doing now is the answer.

Each transition fires at most once, so a stalled frame that crosses two
thresholds produces one warning and one attachment rather than a burst.

## Typing the word is not surviving the hazard

This is the change worth understanding. Completing the prompt **commits** the
player: it starts a lane change or a jump and earns them the points. Whether
they actually get past is decided at the collision plane, by where their body
is — settled in the safe lane, or above clearance height.

In practice a committed player always makes it, because `motionReserveMs` placed
the hazard far enough away for the move to finish. That is the point: the
guarantee is _constructed_ in `active-obstacle.ts` and _verified_ in
`resolution.ts`. If a retune ever breaks it, a test says so immediately instead
of a player wondering why they clipped a car they had beaten.

A jump is the one move that waits. Started the instant the word is finished it
would land again before the obstacle arrived, so `moveIsDue` holds it until the
hazard is one reserve away — the spec's "synchronized jump that clears the
obstacle at its collision point". A lane change starts at once, because moving
early is only ever safer.

## Two endings

**Avoided** or **hit**. There is no partial credit any more, because there is
nothing left for partial credit to cost — the dogs used to absorb it, and
nothing does now. A hit ends the run.

`failureReason` still tells three apart, because they mean completely different
things about how the map is tuned: `timeout` (the word was never finished),
`collision` (never finished, and drove into it), and `late-move` (committed, but
the move had not carried them clear). The last one should never happen; if it
starts happening, the reserve is wrong.

`isResolvable` is the single double-resolution guard. A late keystroke landing in
the same step as the deadline, a duplicated event, or a re-entrant call cannot
award a second avoidance or charge a second collision.

Notice the division of ownership: `active-obstacle.ts` sets `expired` and
`impacted` when those moments pass but leaves `status` alone. Only resolution
moves a hazard to `resolved` or `missed`. A status written from two places is a
status nobody owns.
