# `game-core/pursuit`

The thing behind you. A gap in metres; at zero the run ends.

## Why it exists

The dogs were deleted in the three-lane rework and nothing replaced them, so the
only pressure left in the game was a hazard deadline — which is invisible, and
is felt only in the second or two before it expires. Something closing on you is
felt every frame, and that continuous presence is most of what makes a runner
hard to put down.

## It invents no new currency

The gap responds to **margin**, the same number that pays the score and the
boost: how much of a hazard's budget was still unspent when its word was
finished. There is one thing to get good at, and three things reward it.

| What happens       | What the gap does                      |
| ------------------ | -------------------------------------- |
| Hazard cleared     | `(margin − neutral) × metersPerMargin` |
| Wrong character    | closes, on the keystroke               |
| Gap word lapses    | closes                                 |
| Coin line declined | **nothing**                            |

## Coins deliberately do not move it

Declining a line of coins costs nothing here, exactly as it costs nothing
everywhere else. Coins are the only optional thing in the game and that is only
true while declining them is free — a chaser that closed on a declined coin line
would make them mandatory for anyone trying to survive, which is the feature
gone. See `../pickups/README.md`.

## How it was tuned

`neutralMargin` is the break-even point, and it was measured rather than chosen.
The first build used `0.30`, which is roughly what a typist at a map's
_advertised_ speed clears with — and that killed the whole tolerance band: a
typist at 85% of target was caught on 8 runs out of 8, on every map. The map
promises a floor, not a ceiling, so the break-even had to sit below the band
rather than at its top. It is now `0.10`.

What that buys, measured over 12 seeds per map at the advertised speed:

| Error rate | Outcome                            |
| ---------- | ---------------------------------- |
| 0%         | finishes every time                |
| 3%         | finishes every time                |
| 6%         | **caught** in most runs            |
| 10%        | dead, to the chaser or to a hazard |

That shape is the point. A clean run is never threatened; an inaccurate one is
hunted down. Accuracy is the statistic the unlock gates read, so the chaser and
the progression now want the same thing from the player.

It follows that the chaser is nearly inert against the metronomic typist in
`playtest-harness`, which never mistypes — the map-progression tests still pass
unchanged, and that is not a sign the feature does nothing. It is a sign the
harness models a player who does not make the mistake the feature punishes.
