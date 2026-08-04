# `game-core/keystats`

Which keys the player actually fumbles.

## Why

The game measured WPM and accuracy and told the player both, and neither is
_actionable_. "88% accurate" does not say what to practise. This does: per
character and per digraph, how often it was reached and how often it was got
wrong.

Two uses, and the second is the point:

- the results screen names the worst few, so improvement has a target;
- **prompt selection is weighted toward them**, so the game practises them for
  you. That is the difference between a typing game and typing practice, and it
  costs the player no extra effort at all.

## The one rule that matters

**Record the character the prompt asked for, never the one that was typed.**
Typing `q` where the prompt wanted `e` is evidence about `e`. Recording `q`
would build a table of the keys a player reaches for by accident, which teaches
nothing and would steer practice toward words they have no trouble with.

Only `applyInput` knows which character was expected at the moment a key landed,
which is why `TypingState` carries `lastAttempts` — recovering it afterwards
would mean a second implementation of the same diff.

## Digraphs

A lot of typing difficulty is not in a key but in a transition — the same finger
twice, an awkward roll. Somebody who hits `t` and `h` reliably alone can still
fumble `th`, and a per-character table cannot see it.

Digraphs are tracked and reported but **not** used for steering. Prompt
selection matches on characters a word contains, and a word containing `t` and
`h` does not necessarily contain `th`; weighting on the pair would practise the
wrong words.

## What is deliberately excluded

**Spaces.** The most-typed character by a wide margin and almost never wrong.
Counting them buries every real weakness under one enormous, useless row.

**Keys with too little evidence.** `minimumAttempts` defaults to 6, because
without it the table is topped by whatever the player typed twice and got wrong
once — a 50% miss rate on no evidence at all. That is an accident, not a
weakness.

## Bounded, because it is persisted

Digraphs are quadratic in the alphabet. `MAX_TRACKED_KEYS` prunes to the
best-evidenced entries, which are also the only ones worth acting on.

## Scope of the steering

While a map's secret sentence is running it supplies **every** prompt, in order,
so the selector is never consulted and weighting cannot apply — see `drawPrompt`
in `run-session.ts`. Steering therefore operates on the fallback vocabulary:
after the sentence is finished, and on the endless map, which has none.

That is a real limit rather than a bug. The sentence is a designed feature and
reordering it to chase weak keys would destroy it. Endless being the mode where
targeting fully applies is a reasonable fit — it is the one that exists to be
played repeatedly.

Measured on the fallback vocabulary: a targeted character appears in roughly
**29%** of prompts against **9%** untargeted.
