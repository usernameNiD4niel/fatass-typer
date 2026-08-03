# `content` — game data

Data only. No logic.

## Contract

- Word lists, phrase lists, map configs, obstacle definitions, difficulty tuning.
- Plain data modules or JSON. Systems read this; they never hardcode tuning values.
- No magic numbers elsewhere in the codebase — map tuning belongs here (CLAUDE.md §3).
- Content rules from spec §15: no slurs, no obscure words in beginner maps, no ambiguous
  whitespace, punctuation prompts must be intentional.

## Contents

- `maps.ts` — `MAP_1`, the only map so far. Distance, base speed, reaction buffer, chase
  profile, boost profile, prompt categories, and unlock rule, all as data. Steps F2 and F3
  tune it and add maps 2 to 6 without touching code.
- `obstacles.ts` — the seven obstacles from spec §5: crate, low barrier, puddle, trash bin,
  hanging sign, roadwork barrier, narrow passage. Each carries its avoidance action, its
  prompt category (which is what actually sets the difficulty), a flat reaction allowance,
  and the lowest map it may appear on.
- `prompts.ts` — the starter vocabulary for the vertical slice. Step F1 expands it into
  proper category files. `normalizedText` is derived from `text` rather than typed by hand,
  so the two cannot disagree.

Map 1's chase numbers are set so all three dogs are on screen at the starting gap. A gap
wider than the camera can show turns the chase into an invisible timer.

`content.test.ts` validates every entry with the same guards a corrupt save would face, and
checks the cross-references: a map may only list obstacles that exist and are allowed on it,
and every prompt category a map draws from must have prompts available.

The rest of the content set arrives in phase F. See CLAUDE.md §5.
