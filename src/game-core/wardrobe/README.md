# `game-core/wardrobe`

Credits, what they buy, and what is being worn.

## The rule that matters

**Nothing here changes a rule.** A skin decides what the runner is made of and
what a finished word looks like. A player wearing every skin runs at exactly the
speed of a player wearing none, types against the same budget, and is chased by
the same thing.

That is not a nicety. The moment a skin is worth buying _for the advantage_,
credits stop being a reward for playing well and become a tax on playing at all
— and the game starts wanting the player to grind rather than to type. If
`RunnerLook` ever grows a field that is not a colour, this promise has been
broken.

The wardrobe screen says the same thing out loud, and a test asserts the copy is
there.

## Where the money comes from

Two sources, and deliberately two:

| Source              | Why                                         |
| ------------------- | ------------------------------------------- |
| Placing in the race | The headline. It is what the race is _for_  |
| Coins collected     | So a player who is being beaten still earns |

A wardrobe that only ever opened for the winner would be a wardrobe most players
never see. A wardrobe that ignored the race would make the opponents pointless.

**A run the chaser ended pays nothing.** Being caught is the failure state, and
paying it would make the shortest possible run the most efficient way to earn.

## Buying equips

Somebody who has just spent nine hundred credits on gold shoes wants to be
wearing gold shoes. Equipping is not a second step they have to discover, and
changing back is free.

A purchase that cannot go through returns the profile **unchanged**, so a
double-click cannot charge twice.

## Free skins are owned by everybody

One per category costs nothing and is never written into the profile. A save
that had to _record_ the free items would be a save that could lose them — and
the first thing a corrupt profile would take is the clothes off the runner's
back.

## Unknown ids resolve to the default

A skin that is renamed or retired leaves somebody's profile pointing at nothing.
`equippedSkin` falls back to the free skin of that category rather than throwing
or rendering an untextured figure. The id is left in the profile rather than
stripped, so a build that restores the skin restores the choice with it.

## The seam

`game-scene` may not read the profile or the catalogue, and this module may not
know what a shirt is. So `content/runner-look.ts` translates: profile in,
`RunnerLook` out — five colours, which is all the scene is told.
