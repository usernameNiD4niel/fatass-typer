# `game-core/race`

Two opponents, running the same road.

## What they are, and what they are not

They run, they finish before or after you, and **they take coins**. They do not
type, cannot be collided with, and cannot end a run — the chaser keeps that job,
and giving the race a second way to lose would mean two unrelated clocks running
against the player at once.

Their **drawn pace** is not reactive: it never looks at the player, because a bot
that quietly matched your pace would make the standing meaningless — you would
always be roughly level, whatever you did. What is reactive is the **chase**,
which applies only to an opponent that is behind. See below.

## Why the pace wanders

A racer holds a **target pace** and drifts toward it, and the target is re-drawn
every three to eight seconds. A bot at a fixed speed is a line on a graph —
within ten seconds the player knows whether they are winning and nothing that
happens afterwards changes it. A wandering one has to be beaten repeatedly.

The band the target is drawn from comes from `referenceSpeed(map)`, which is the
map's ramped speed times a share of its boost. That share is the tuning that
decides everything else in the feature:

| Player                               | What happens                                                    |
| ------------------------------------ | --------------------------------------------------------------- |
| Typing at the map's advertised speed | Neck and neck. The lead changes hands; some coin lines are lost |
| Typing well above it                 | Pulls clear, and keeps essentially every coin                   |
| Typing below it                      | Watches both opponents take the road                            |

`0.55` was tried first and was too much: a target-speed player never once led,
so every coin in every run went to a bot. It is `0.25`, measured rather than
guessed — see the coin assertions in `map-progression.test.ts`.

**This share is a cliff, not a dial.** The coin contest is winner-take-all — a
lead compounds, so the standings settle in the opening seconds and hold. Moving
it five points, `0.25` to `0.30`, took a typist at the map's advertised speed
from a real share of the coins to **zero on all six maps**, and dropped a typist
at 1.7× the advertised speed from four fifths of them to a quarter. Three
attempts have now died here: a flat rise, a ladder up the six maps, and a floor
that tracked the player's own momentum. Make the opponents harder in the chase.

## The coin contest

Whoever is in front reaches a coin first and takes it. That is the whole rule,
and it is deliberately **not lane-aware**: a bot that only took coins in the lane
it happened to be running in would contest a line about a third of the time and
read as random. "Whoever is in front gets there first" is a rule a player can
hold in their head while typing.

The consequence worth stating: a player who never leads never collects a coin.
That is intended. Coins stopped being a reward for noticing them and became a
reward for being ahead, which is what makes the race matter minute to minute
rather than only at the finish line.

A **magnet still beats it**. It was bought with a whole sentence typed clean, and
an item a bot can pip is not worth the sentence.

## Standings

Ties go to the player. A bot drawn at exactly the player's pace would otherwise
flicker the standing every frame, which is unreadable and feels unfair besides.

Placement pays a bonus on the run's score, and only on a run that **reached the
finish line** — see `placementBonus` in `game-runtime/session/runtime-host.ts`.
Paying for the standing held at the moment the chaser caught you would make
being caught early while leading worth more than being caught late while second.

## Everybody starts from a standstill

The player opens a run at base speed with no momentum; the opponents open at
their pace. So the first seconds belong to them however fast the player
eventually types, and the opening coin line is often lost. That is a start, not
a leak.

## The chase

An opponent more than **10 metres behind** the player runs harder, by 0.12 m/s per
metre of deficit, capped at 55% of the map's pace. One in front gets nothing.

This is the only dial for making a good player work, and it is safe to lean on
precisely because it applies to an opponent who is **behind** — it cannot take a
coin off a player who is in front. The coin assertions still pass at a 4-metre
dead band and a cap of a whole extra map pace; where the numbers stop is a
judgement about how a rubber band should feel, not a limit the tests imposed.

The dead band is why a level race is left alone. Without it, one of the two is
always a few metres down and always being handed the margin back.

### Why it reads the player's momentum

The reported bug: *"when I do not type the bots aren't moving faster, as if they
do not create advantage while I am not typing."* True as written. Drawn pace
never looked at the player, and a player who stops typing does not stop — their
momentum only sags to `COASTING_FLOOR`, a few percent. Putting the keyboard down
was close to free.

So the further the player's momentum sits below what a working typist holds
(`0.55`), the smaller the gap an opponent tolerates — the dead band shrinks by up
to 75%, to 2.5 metres — and the harder it runs, up to double the chase rate.

It **integrates**, which is the point. Momentum bottoms out between words for
everybody, including a typist at twice the map's speed, so no instantaneous
reading can tell idling from an ordinary gap between two words. Half a second of
dip is worth a fraction of a metre and vanishes; ten seconds of silence is worth
a chunk of the lead. Nothing has to decide what counts as "idle" — the arithmetic
does it.
