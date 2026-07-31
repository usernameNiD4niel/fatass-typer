# `content` — game data

Data only. No logic.

## Contract

- Word lists, phrase lists, map configs, obstacle definitions, difficulty tuning.
- Plain data modules or JSON. Systems read this; they never hardcode tuning values.
- No magic numbers elsewhere in the codebase — map tuning belongs here (CLAUDE.md §3).
- Content rules from spec §15: no slurs, no obscure words in beginner maps, no ambiguous
  whitespace, punctuation prompts must be intentional.

## Contents

Populated by phase F, and by D1 for obstacle data. See CLAUDE.md §5.
