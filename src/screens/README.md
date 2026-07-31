# `screens` — full-screen views

One folder entry per app state: splash, main menu, map selection, level briefing, game,
results, settings, statistics, tutorial.

## Contract

- Screens compose `components`; they do not define new primitives.
- **No game rules here** (CLAUDE.md §3). Rules live in `game-core`.
- Screen switching is driven by the app state machine (step A5), not by ad-hoc booleans.
- Keyboard navigable end to end.

## Contents

Populated by phase E. See CLAUDE.md §5.
