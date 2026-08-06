# `game-core/race`

Two opponents, running the same road.

## What they are, and what they are not

They run, they finish before or after you, and **they take coins**. They do not
type, cannot be collided with, and cannot end a run — the chaser keeps that job,
and giving the race a second way to lose would mean two unrelated clocks running
against the player at once.

Nothing about them is reactive. They do not speed up when you do, they do not
rubber-band, and they never target the player's position. A bot that quietly
matched your pace would make the standing meaningless: you would always be
roughly level, whatever you did.

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
