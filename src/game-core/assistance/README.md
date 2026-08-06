# `game-core/assistance` — adaptive assistance

Pure rules. Counts what happened in a run and returns a multiplier.

## What it may touch

**The reaction buffer, and nothing else.** Not the target speed, not the road, not the
score. A player who keeps letting words lapse is usually a few hundred milliseconds
short, and this gives them those milliseconds — more time to _see_ a prompt, never a slower
game.

Three rules keep it honest (spec §6):

1. It moves the buffer only.
2. It is clamped hard in both directions (0.9× to 1.25× of the map as written), so no run
   drifts far from the map's stated difficulty.
3. **The displayed target WPM never changes.** A number that quietly moved with the player's
   performance would make every other number in the game meaningless.

Easing takes three consecutive misses; tightening takes eight consecutive clears. The
asymmetry is deliberate — being given help you did not need is a small unfairness, having it
taken away mid-recovery is a large one.

## It is effectively off, and that is worth knowing

Assistance eases after three consecutive misses. Since the three-lane rework, a
single miss ends the run — so there is almost never a second failure for it to
count, let alone a third.

This is structural rather than a bug, but it is a _different_ structural reason
than before. It used to be dormant because the dogs caught a struggling player
before assistance could help them. Now it is dormant because the run is simply
over.

Which arguably makes it worse than useless: the one moment it could fire is the
first word of the _next_ run, when the player has already been reset. Making
it meaningful again would mean triggering on near-misses — words finished with
very little time left — rather than on misses. That is a design decision, not an
implementation one.

`game-runtime/session/assistance-run.test.ts` pins the dormancy, so if the
tuning ever shifts enough for assistance to start mattering, it surfaces
deliberately rather than by surprise.
