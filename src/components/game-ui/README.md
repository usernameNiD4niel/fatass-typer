# `components/game-ui`

The menus' own chrome.

## Why it is not `components/ui`

`components/ui` is the neutral kit: a Button is a Button wherever it lands, a
Card is content that sits quietly in a page. This is the layer above it — the
framed panels, label plates, stat tiles and meters that make the shell read as a
game's front end rather than as a settings dialog.

They are kept apart because they answer to different things. A `Card` has to stay
out of the way; a `Panel` here is an instrument housing and is allowed an edge, a
corner notch and a header rail. Merged, every future change to one would have to
be weighed against the other.

## What is in it

| | |
|---|---|
| `Panel` | A framed box with a label plate. The unit of structure on every screen |
| `ScreenHead` | Eyebrow, title, subtitle, optional aside. The same top on all of them |
| `StatTile` / `StatTiles` | One figure, labelled, with an optional tone. And a grid of them |
| `Meter` | A labelled bar. The number is **always** written beside it |
| `TabRail` | The segmented control the wardrobe and statistics both wanted |
| `MapArtwork` | A map's picture. Shared by the carousel, the menu hero, the briefing and the results banner |

Nothing here holds state or knows a rule. They take what to show and show it.

## The four tokens

Everything is built from `--frame-fill`, `--frame-edge`, `--frame-rail` and
`--frame-glow`, so the whole look moves from one place in `tokens.css`.

**A token that differs by theme has to be declared three times**: the light
block, the dark block, and the `prefers-color-scheme: dark` fallback. The
fallback is what an ordinary player gets — system dark, Settings never opened.
Leaving `--frame-*` out of it once rendered the light theme's near-white panel on
a near-black page, on every screen at once. `styles/tokens.test.ts` now fails on
that specific omission.

## Rules the kit keeps

- **Tone is never the only signal.** A tile's tone colours its left edge, never
  the figure — colouring the number would make it harder to read at exactly the
  moment it matters, and spec §12 rules out anything said in colour alone. The
  note beside it says the same thing in words.
- **A bar always has its number.** `Meter` renders the value as text and marks
  the bar `aria-hidden`; a bar on its own is a shape the player has to estimate.
- **Panels do not own padding exceptions.** Two screens bleed artwork to a
  panel's edge and both do it with negative margins of their own. A `Panel` prop
  for "sometimes the body has no padding" would be one every future caller had to
  reason about.
