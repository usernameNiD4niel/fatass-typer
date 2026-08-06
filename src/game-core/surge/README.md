# `game-core/surge`

A long sentence, typed clean, for speed. Everybody gets one a minute.

## Why it exists

The race can run away from a player. Two opponents who are quicker than you this
minute are quicker than you the next, and a runner forty metres down with a
minute to go has nothing to _do_ about it — every other mechanic in the game
pays out in the same proportion whoever is winning, so a gap only ever widens.

The surge is the exception, and the only one. It arrives on a fixed clock, it is
the same for everybody, and it is the one thing that can turn a race around in
ten seconds.

## The bargain

A sentence far longer than anything else the game asks for. While it is running
the player is already faster; finishing the whole thing clean pays a larger
boost that lasts twelve seconds.

**One wrong character ends it.** Not the run, not the combo — the surge. The
speed stops immediately and the sentence goes. The longer you have held it, the
more you have to lose, and the temptation is to hurry exactly when hurrying is
most expensive.

## Two things that had to be fixed after the first build

Both were found by tests rather than by playing, and both are the kind of thing
that looks fine in isolation.

**It paid for being on screen.** The first version set a momentum floor for the
whole time a surge was live, which handed free speed to somebody typing nothing
at all — an idle run finished the map on surges alone. The floor now scales with
how much of the sentence has actually been typed. What the surge pays for is
holding the sentence, so the payment tracks how much of it is being held.

**It suspended the rest of the game.** A surge owns the typing field, so no gap
word is up while it runs — and with a budget proportional to a twelve-word
sentence, that was over a minute on a 20 WPM map in which nothing could go
wrong. `SURGE_MAX_MS` caps it at twenty seconds, and a lapsed surge now costs
the same ground a lapsed gap word does. The road going quiet costs the same
whichever prompt was supposed to be filling it.

## Long _for this map_

Twenty seconds at 20 WPM is about thirty characters; at 50 WPM it is about
eighty. `pickSurge` takes the longest sentence a typist at the map's own speed
could finish inside the cap, so Map 1 gets the short end of `content/surges.ts`
and Map 6 gets the far end.

Handing Map 1 a twelve-word sentence would be handing it a reward nobody there
can collect, which is a punishment wearing a reward's clothes.

## The opponents surge too

At the same moment, weighted to whoever is behind — see `racerSurgeShare`. A
surge only the player got would turn a catch-up tool into a way for a strong
typist to leave the field for good, which is the opposite of what it is for.

The leader still gets something. A minute in which the runner in front simply
stops gaining would read as the game taking their lead away rather than as
somebody else earning it back.
