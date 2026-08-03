# `content` — game data

Data only. No logic.

## Contract

- Word lists, phrase lists, map configs, obstacle definitions, difficulty tuning.
- Plain data modules or JSON. Systems read this; they never hardcode tuning values.
- No magic numbers elsewhere in the codebase — map tuning belongs here (CLAUDE.md §3).
- Content rules from spec §15: no slurs, no obscure words in beginner maps, no ambiguous
  whitespace, punctuation prompts must be intentional.

## Contents

- `maps.ts` — all six maps (steps F2, F3). Distance, base speed, reaction buffer, chase
  profile, boost profile, prompt categories, and unlock rule, all as data. The buffers run
  1.70 → 1.08 and the accuracy gates 85% → 92%, exactly as spec §6 suggests.

**The maps are tuned against a simulated typist**, not by feel —
`game-runtime/session/playtest-harness.ts` plays a full run at an exact WPM, optionally
mistyping at a fixed rate. `map-progression.test.ts` states the result as assertions: every
map is finishable at its advertised speed _including while mistyping one character in
twelve_, and no prompt any map can spawn demands more WPM than the map prints on its card.

Difficulty is never one dial (spec §6). Each map raises the target speed, tightens the
buffer, shortens the obstacle interval, widens the vocabulary, and adds obstacle kinds. The
one lesson the tuning taught: **boost duration has to outlast the prompts a map draws.**
Maps 3 to 6 all failed their error runs until their boosts were lengthened — long phrases
with a short boost starve the player of speed no matter how gentle the chase is.

- `obstacles.ts` — the seven obstacles from spec §5: crate, low barrier, puddle, trash bin,
  hanging sign, roadwork barrier, narrow passage. Each carries its avoidance action, its
  prompt category (which is what actually sets the difficulty), a flat reaction allowance,
  and the lowest map it may appear on.
- `prompts/` — the vocabulary, one file per category (step F1): `words.ts` (short, medium,
  long), `symbols.ts` (punctuation and numbers), `phrases.ts`, `themed.ts`. `build.ts`
  derives everything that is not the text itself — `normalizedText` from `text`, so the two
  cannot disagree, and `difficulty` from length within the category's own band, because two
  hundred hand-assigned numbers would drift out of order the first time anyone added a word.

**What keeps the content honest.** Obscure words are not filtered out, they are simply not in
the file: a player who has to _read_ a word before typing it has already lost the race.
Punctuation entries are contractions, hyphenated words, and real clauses rather than
decorative symbol soup. Punctuation, numbers, and long words start on Map 2 or later — they
are what breaks a beginner's rhythm, and Map 1 exists to build one. Themed words are a
_preference_, never a requirement: a themed pool small enough to run dry would repeat itself
into nonsense.

Map 1's chase numbers are set so all three dogs are on screen at the starting gap. A gap
wider than the camera can show turns the chase into an invisible timer.

`content.test.ts` validates every entry with the same guards a corrupt save would face, and
checks the cross-references: a map may only list obstacles that exist and are allowed on it,
and every prompt category a map draws from must have prompts available. It also enforces the
spec §15 rules that are easy to break by hand — unique text, no ambiguous whitespace, no
smart quotes or non-breaking spaces (they look identical to the typeable characters and would
make a prompt quietly unwinnable), and every prompt inside its category's length band.

The rest of the content set arrives in phase F. See CLAUDE.md §5.
