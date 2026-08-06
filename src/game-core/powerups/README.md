# `game-core/powerups` — the one place that asks for perfection

Pure rules. No clock, no randomness beyond the seeded RNG, no DOM.

## The rule

About once a minute a crate appears in a lane with a **whole sentence** over it.
Type it and the powerup is yours. **One mistake and it is gone** — not a
shortened deadline, not a partial reward, gone.

That severity is the entire feature. Everywhere else the game is deliberately
forgiving: a wrong character costs your combo, never your run, because accuracy
is a statistic the progression gates on and a game that ends on one slip cannot
measure it. A powerup is the exception that makes the rule interesting. It is
optional, it is rare, and it asks a question nothing else asks — not _can you do
this fast_ but _can you do this cleanly_.

Missing one costs nothing else. The run carries on, the crate goes by.

## The three

|                 | What it does                                                                         | How long    |
| --------------- | ------------------------------------------------------------------------------------ | ----------- |
| **Flight**      | Nothing on the road applies. Hazards do not even attach a word — you are above them. | 30s         |
| **Extra lives** | Two crashes absorbed instead of ending the run.                                      | Until spent |
| **Magnet**      | Coins collect wherever you are, and their deadlines stop mattering.                  | 20s         |

Flight and the magnet **refresh** rather than stack — thirty seconds from the
second one, which is what a player expects and what a countdown can actually
show. Shields stack, because a second life is worth having and there is no
countdown to confuse.

The magnet is the one thing in the game that collects coins without typing for
them. That is a deliberate exception, and it was bought with a whole sentence
typed clean.

## Why the sentence gets a generous budget

`POWERUP_BUFFER` is 1.45 — more slack than a flow word and far more than a coin.
Asking for speed _and_ perfection at once would put powerups out of reach of
anyone but the top of the ladder, and the no-mistake rule is already the hard
part.

## Why they are worth a whole gap

A crate needs the road to itself: no coins, nothing else being collected. It
does **not** wait for the flow word, and that is a deliberate change — a word is
on screen essentially all of the time now, so a crate that waited for a clear
field would simply never appear. It takes the field the way a coin line does,
and dropping a flow word costs nothing.

The first crate is a full interval in, like every one after it. Bringing it
forward to half an interval was tried and dropped a perfect typist's finish rate
from 100% to as low as 31%: a long sentence early in a run arrives exactly when
the player has the least speed banked and the least ground on the chaser. Powerups turn out
to be a reward for surviving a while, and the tuning agrees.
