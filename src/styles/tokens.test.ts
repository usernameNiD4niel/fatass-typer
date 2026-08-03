import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with the project root as cwd; import.meta.url is not a file URL
// under the jsdom environment.
const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Returns the body of the first block whose selector line starts with `selector`. */
function blockBody(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `selector not found: ${selector}`).toBeGreaterThanOrEqual(0);

  const open = css.indexOf('{', start);
  let depth = 0;

  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }

  throw new Error(`unterminated block for selector: ${selector}`);
}

/** Custom property names declared directly in a block body. */
function declaredTokens(body: string): Set<string> {
  return new Set(body.match(/--[\w-]+(?=\s*:)/g) ?? []);
}

const lightTokens = declaredTokens(blockBody(":root[data-theme='light']"));
const darkTokens = declaredTokens(blockBody(":root[data-theme='dark']"));

describe('design tokens', () => {
  it('defines a light theme', () => {
    expect(lightTokens.size).toBeGreaterThan(20);
  });

  it('defines every light semantic token in the dark theme too', () => {
    // Shadows and a few surfaces are the ones most often forgotten when adding
    // a token, and a missing one silently inherits the light value.
    const missing = [...lightTokens].filter((token) => !darkTokens.has(token));

    expect(missing, `dark theme is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('does not declare dark-only tokens the light theme lacks', () => {
    const extra = [...darkTokens].filter((token) => !lightTokens.has(token));

    expect(extra, `light theme is missing: ${extra.join(', ')}`).toEqual([]);
  });

  it('mirrors the dark theme into the prefers-color-scheme fallback', () => {
    const fallback = declaredTokens(blockBody(":root:not([data-theme='light'])"));
    // The fallback may legitimately skip tokens that do not change, but every
    // token it does declare must exist in the real dark theme.
    const unknown = [...fallback].filter((token) => !darkTokens.has(token));

    expect(unknown, `fallback declares unknown tokens: ${unknown.join(', ')}`).toEqual([]);
  });

  it('collapses motion durations under reduced motion', () => {
    const reduced = blockBody(":root[data-reduced-motion='on']");

    expect(reduced).toContain('--duration-normal: 0ms');
    expect(reduced).toContain('--duration-slower: 0ms');
  });

  it('answers a request for more contrast in both themes (spec §12)', () => {
    const contrast = blockBody('@media (prefers-contrast: more) and (prefers-color-scheme: light)');
    const dark = blockBody('@media (prefers-contrast: more) and (prefers-color-scheme: dark)');

    // The prompt is where legibility matters most, so it is the thing checked:
    // an override block that forgot it would be decorative.
    expect(contrast).toContain('--prompt-text-correct');
    expect(contrast).toContain('--prompt-text-incorrect');
    expect(dark).toContain('--prompt-text-correct');
    expect(dark).toContain('--prompt-text-incorrect');
  });

  it('thickens the focus ring under increased contrast', () => {
    const start = css.indexOf('@media (prefers-contrast: more)');

    expect(start).toBeGreaterThanOrEqual(0);
    expect(css.slice(start)).toContain('--focus-ring-width: 4px');
  });

  it('keeps the documented desktop minimum width', () => {
    expect(css).toContain('--layout-min-width: 1024px');
  });
});
