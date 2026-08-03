# `e2e/` — Playwright

What only a real browser can tell you: that the canvas got a 2D context, that
`requestAnimationFrame` drives the loop, that the lazily-loaded screens actually
arrive, and that a keystroke reaches the typing field. Everything below this
layer has unit tests; none of them can answer those.

```bash
npx playwright install chromium   # once
npm run test:e2e
npm run test:e2e:ui               # watch it happen
```

The suite runs against the **production build** — `playwright.config.ts` builds
and previews it — because code splitting and Suspense boundaries only exist
there.

Two rules the specs follow:

- **Query by role and accessible name, never by CSS class.** A test that breaks
  when a class is renamed tests the stylesheet; a test that breaks when a button
  loses its name tests something worth knowing.
- **Type what is on screen.** Prompts come from a seeded pool, so asserting on a
  particular word would be asserting on the seed. The specs read the prompt from
  the field's own accessible name and type that.

`navigation.spec.ts` covers getting around by keyboard alone. `run.spec.ts`
covers a run: starting it, typing, pausing with Escape, restarting with
Ctrl+Enter, quitting, and being caught.
