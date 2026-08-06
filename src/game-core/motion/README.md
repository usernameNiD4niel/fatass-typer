# `game-core/motion`

Where the player is between lanes, and how far off the ground.

## Why the easing lives here and not in the scene

The car encounter turns on one question: **had the lateral move finished when the
collision plane arrived?** That is a question about the easing curve. If the curve
lived in the renderer, the rules could not answer it — they would be guessing at
an animation they cannot see, and the guess would be wrong the moment anyone
tweaked a duration.

So `lanePosition()` and `jumpHeightMeters()` are the single source of truth.
The rules compare them to where a coin line is; the
scene multiplies them by `laneWidthMeters` and `jumpApexMeters` and draws them.
The scene may add roll, lean, squash, and dust on top — cosmetics only. It never
computes position.

## Why state carries its own durations

`JumpState` and `LaneTransition` hold `durationMs`, not a reference to the
`MotionProfile` they came from and not a start timestamp. Advancing needs
nothing but a delta.

That is what makes pausing free. Stop calling `advanceMotion` and the move is
frozen exactly where it was — no clock to drift, nothing to rebase on resume,
and no way for a paused run to quietly lose or gain animation progress.

## Moves do not queue

`beginLaneChange` and `beginJump` return the motion unchanged unless
`isSettled()`. An unresolved move means the previous swerve is still being
avoided, and stacking moves is how a player ends up somewhere neither the rules
nor the animation expected. The spawner enforces the same rule from the other
end by refusing to spawn while a swerve is live.

## The jump arc is inverted, not authored

`MotionProfile` authors an apex height and an airborne duration. The time at
which the player first exceeds `clearanceMeters` is _derived_ from those, in
`models/motion.ts:timeToClearanceMs`, by inverting the same parabola
`easing.ts:parabolicArc` draws.

An authored "takeoff time" would be a second copy of a number the arc already
implies, and the two would eventually disagree. Coin placement reads the derived
value, so a coin line is always far enough away for the swerve to
reach clearance before impact.
