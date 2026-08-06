# `game-core/flow`

Flow words: the word in front of the player. Which, now, is nearly always.

## The contract

A flow word has **no body and no world position**. It is a prompt and a deadline.
Typing it pays points, extends the combo, tops up momentum and pushes the chaser
back; letting it expire breaks the combo and hands the chaser ground. Nothing
else happens, in either direction, ever.

## What they used to be, and why that matters

They were invented as a **gap-filler**. Every other prompt in the game carried a
_move_ — a lane change for a car, a jump for a barrier, a swerve for coins — and
a move needs road, and road needs time. The dead stretch after a player committed
to a hazard, while their body was still travelling to the collision plane, could
not hold anything that moved them. It could hold a word.

So they were allowed **only in a tail**, bound to a committed hazard or coin
line. That restriction was load-bearing: left free to appear on open road, they
starved the hazard spawner outright — the field was never clear, so no hazard was
ever placed, and a run became a word list with scenery.

## The gate is now inverted, and it has to be

Hazards are gone. There is no spawner left to starve, so the restriction protects
nothing and would instead be fatal: bound to a committed coin line, a flow word
could appear roughly once every eight seconds and the road would be silent for
most of a run.

A flow word is therefore the **default state of the field**. It goes up whenever
nothing else holds the field, and it _yields_ — costing nothing, because it has
no body to interrupt — when a coin line or a crate wants it.

This reads as a mistake to anyone who remembers the old rule. It is the opposite
rule, deliberately, for a game that no longer has the thing the old rule
protected.

## Why missing one is not fatal

It is not fatal on its own — but it is no longer free. With a word on screen
essentially all of the time, a word that ended the run outright would make a run
a coin flip. Instead a lapse costs the combo and a fixed slice of the chaser's
gap, and enough lapses lose the run. Failure is cumulative, which is what lets it
be forgiving per word and still decisive over a run.

## Budget

`flowBufferFor(map)` is the map's own reaction buffer plus a tolerance the map
names — and it is **the difficulty ladder**, now that flow words are the primary
prompt. A single constant here would give all six maps the same tolerance and the
ladder would stop gating anything.

Each map's buffer sits between `1/0.85` and `1/0.75`. That band is the whole
mechanism: a typist inside the map's tolerance band never lapses a word, and one
a quarter below its advertised speed lapses constantly. `content/pace.test.ts`
proves it per map × word rather than sampling it.
