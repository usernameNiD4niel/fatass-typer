# `game-core/flow`

Flow words: the word that is on screen when nothing else is.

## The contract

A flow word has **no body and no world position**. It is a prompt and a
deadline. Typing it earns points and extends the combo; letting it expire breaks
the combo. Nothing else happens, in either direction, ever.

That emptiness is the entire feature. Everything else in the game that carries a
word also carries a _move_ — a lane change for a car, a jump for a barrier, a
swerve for coins — and a move needs road, and road needs time. The dead stretch
after a player commits to a hazard, while their body is still travelling to the
collision plane, cannot hold anything that moves them. It can hold a word.

## Why not just pack more hazards in

Two attempts are recorded in `../obstacles/README.md` and in CLAUDE.md, both
reverted:

1. **Overlapping hazards** — the second word attaches while the first move is in
   flight, and committing to it preempts a move the player had already earned.
   Ends every run. Adding a queue produced `late-move` failures on hazards typed
   perfectly and inverted the difficulty curve.
2. **Coin words in a hazard's tail** — coins were typed but uncollectable,
   because the swerve cannot start until the hazard's plane is behind the player.

Both failed on the same thing: two bodies cannot be in two places. Flow words
sidestep it by not being a body.

## Where they are allowed

Only in a **tail** — the stretch after a hazard or a coin line has been _answered_, while
the body is still travelling to its plane. Left free to appear on open road they starve
the hazard spawner outright: the field is never clear, so no hazard is ever placed and a
run becomes a word list with scenery. Bound to a committed encounter they can only ever
occupy time in which no second encounter could have been asked for anyway, and every word
on screen belongs to something on the road.

Nothing preempts them, either. The spawner waits for the field the way it already waited
for a coin line, so a word is never swapped out from under the player mid-keystroke — a
gap word that overruns simply delays the next hazard, and a hazard is placed relative to
the player when it spawns, so a later hazard is not a closer one.

## Why missing one is not fatal

With a word on screen essentially all the time, a fatal filler word would make
the run a coin flip rather than a test. Only hazards end runs. Flow words are
where the _volume_ comes from; hazards are where the stakes are.

## Budget

`FLOW_BUFFER` is tighter than a hazard's reaction buffer and about level with a
coin's, because a flow word costs nothing to notice — it appears where the last
one was, in a rhythm the player is already in. The buffer a hazard spends on
being seen is a buffer this does not need.
