# `game-core/pursuit`

The thing behind you. A gap in metres; at zero the run ends.

## Why it exists

The dogs were deleted in the three-lane rework and nothing replaced them, so the
only pressure left in the game was a deadline — which is invisible, and is felt
only in the second or two before it expires. Something closing on you is felt
every frame, and that continuous presence is most of what makes a runner hard to
put down.

It has since become **the only way to lose**. Hazards are gone; nothing on the
road can be collided with. Every run that is not finished ends here.

## It invents no new currency

The gap responds to **margin**, the same number that pays the score and the
speed: how much of a word's budget was still unspent when it was finished. There
is one thing to get good at, and three things reward it.

| What happens       | What the gap does                      |
| ------------------ | -------------------------------------- |
| Word finished      | `(margin − neutral) × metersPerMargin` |
| Coin word finished | the same — see below                   |
| Wrong character    | closes, on the keystroke               |
| Word lapses        | closes, and by much more               |
| Coin line declined | **nothing**                            |

Losing bites harder than winning pays (`lossFactor`), because gains are capped by
`maxMeters` and losses are not. Symmetric, a player could bank the ceiling early
and then coast below the break-even margin for the rest of the run.

## Coin words pay, and declining still costs nothing

Both halves matter and they look contradictory. A coin word takes the field from
the flow word while it is asking, so if only flow words paid ground, accepting a
coin line would gain _less_ than ignoring one — the optional pickup would be a
trap. Paying both on the same formula makes the two paths equivalent.

Declining remains free because **expiry calls nothing at all**. Coins are the
only optional thing in the game and that is only true while ignoring them is
free. See `../pickups/README.md`.

## How it is tuned

`neutralMargin` is the break-even margin, and it is **derived per map** rather
than configured — see `tuning.ts`. A typist at the tolerance band's floor
produces a predictable margin on a map with a known word budget, so setting
break-even there makes all three progression bars consequences rather than
coincidences: at the advertised speed the gap grows, at the band's floor it holds
level, below the band it shrinks on every word.

### What this alone could not do

Chaser numbers could not separate a typist at 85% of target from one at 75%. The
margins the two produce are close, a run is a few dozen words rather than an
infinite sample, and variance swamped the difference — every setting that reliably
caught the slower one also caught the faster one on some seeds.

The gate is therefore in the **word budget**, not here: each map's flow buffer
sits inside `(1/0.85, 1/0.75)`, so a typist in the band never lapses a word and
one below it lapses constantly, and a lapse costs several times what a scraped
word does. This module supplies the pressure; `flow/flow-word.ts` supplies the
cliff.
