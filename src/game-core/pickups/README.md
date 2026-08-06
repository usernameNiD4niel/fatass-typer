# `game-core/pickups` — coins

Pure rules. No clock, no randomness beyond the seeded RNG, no DOM.

## What they are for

Not the score. The road between words used to be several seconds of empty tarmac
with nothing to type, and that dead time — not the difficulty — was what made
the game feel slow. Coins fill it.

The effect on a run is the point: a player now has a word in front of them
almost continuously, without the run ever becoming a gauntlet where one slip is
fatal. Hazards supply the danger; coins supply the tempo.

## The one rule

**You get them by typing, or you do not get them.** Driving through a line of
coins collects nothing. Typing the word starts a swerve into their lane, and the
swerve is what collects — which is why typing it far too late still ends with
watching them go past.

## Everything else about them is toothless

There is no penalty anywhere in this module, and that absence is deliberate and
load-bearing:

- Missing coins costs nothing. Not score, not combo, not the run.
- A coin word that expires is not a failure. It does not go through
  the chaser, and a declined coin line never moves it.
- Coins never build the combo either. Letting them would make the optional thing
  mandatory for anyone chasing a score.

A coin the player is punished for declining is not optional. It is a demand
wearing gold.

## Why they sit one lane over

Coins straight ahead would be collected anyway, and the word would be a pure
typing bonus with nothing happening on screen. One lane over is a decision, the
swerve is visible, and it reuses the lane-change machinery cars already need.

## Why their words are tighter than the word they interrupt

The flow word they interrupt has to survive hesitation, because lapsing it ends
the run. A coin word does not, so it asks for the map's advertised speed and
very little more (`COIN_BUFFER`). That gap is what makes collecting them feel
like something you did rather than something you were given.

They are also drawn from short words only, whatever the map uses elsewhere. A
detour that takes longer than the words around it is not a detour.

## How they stay out of the way

Two gates, in two directions:

- Coins take the field from a flow word, which costs nothing to drop, and a coin word arriving
  **abandons** any coin word not already committed to. One word on screen, and
  it is always the one that can end the run.
- Nothing preempts a committed coin line, so
  the two alternate rather than collide.

And if a car does arrive mid-swerve, its move **preempts** the coin's — see
`motion/player-motion.ts`. A player who typed their way out of a car is never
told they were busy collecting.
