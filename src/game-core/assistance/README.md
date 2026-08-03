# `game-core/assistance` — adaptive assistance

Pure rules. Counts what happened in a run and returns a multiplier.

## What it may touch

**The reaction buffer, and nothing else.** Not the target speed, not the chase, not the
score. A player who keeps missing the same obstacle is usually a few hundred milliseconds
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

## It is currently dormant, and that is worth knowing

Under the tuning as of F3, assistance **never fires in ordinary play**. A sweep of 360
simulated runs — every map, five hesitation levels, three speeds, four seeds — produced no
easing at all.

The reason is structural rather than a bug. Assistance triggers on missed obstacles, and the
obstacle timing budget is deliberately generous (see `game-core/obstacles` — a prompt is
always on screen early enough for a typist at the map's target speed). A player who is
missing obstacles is therefore already so far behind that the _chase_ catches them first,
and assistance is not allowed to touch the chase.

`game-runtime/session/assistance-run.test.ts` pins the dormancy, so if the tuning ever shifts
enough for assistance to start mattering, it surfaces deliberately rather than by surprise.
Making it meaningful would mean either letting it influence chase pressure — which spec §6
rules out — or triggering on near-misses rather than misses. Both are design decisions, not
implementation ones.
