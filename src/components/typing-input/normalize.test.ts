import { describe, expect, it } from 'vitest';

import { isIgnoredKey, MAX_INPUT_LENGTH, normalizeInput, shouldSubmit } from './normalize';

/** Written as escapes on purpose — an invisible character in a test file is a trap. */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const BELL = String.fromCharCode(0x07);
const NON_BREAKING_SPACE = String.fromCharCode(0x00a0);
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);

describe('isIgnoredKey', () => {
  it('swallows keys a prompt can never contain', () => {
    for (const key of ['Enter', 'PageUp', 'PageDown', 'Insert', 'F1', 'F12']) {
      expect(isIgnoredKey(key)).toBe(true);
    }
  });

  it('lets Tab and Escape through so the page keeps working', () => {
    expect(isIgnoredKey('Tab')).toBe(false);
    expect(isIgnoredKey('Escape')).toBe(false);
  });

  it('lets ordinary typing through', () => {
    for (const key of ['a', 'Z', '7', ' ', ',', "'", 'Backspace', 'ArrowLeft', 'Shift']) {
      expect(isIgnoredKey(key)).toBe(false);
    }
  });
});

describe('normalizeInput', () => {
  it('leaves ordinary text alone', () => {
    expect(normalizeInput('the quick, brown fox 42!')).toBe('the quick, brown fox 42!');
  });

  it('keeps punctuation and spaces, which prompts contain', () => {
    expect(normalizeInput("don't stop; keep going.")).toBe("don't stop; keep going.");
  });

  it('keeps letters outside ASCII', () => {
    expect(normalizeInput('café niño straße')).toBe('café niño straße');
  });

  it('folds newlines and tabs into a single space', () => {
    expect(normalizeInput('two\nwords')).toBe('two words');
    expect(normalizeInput('two\r\n\twords')).toBe('two words');
  });

  it('strips invisible characters that would count but not show', () => {
    expect(normalizeInput(`a${ZERO_WIDTH_SPACE}b${BYTE_ORDER_MARK}c`)).toBe('abc');
    expect(normalizeInput(`a${BELL}b`)).toBe('ab');
  });

  it('converts a pasted exotic space to a plain one', () => {
    expect(normalizeInput(`two${NON_BREAKING_SPACE}words`)).toBe('two words');
    expect(normalizeInput(`two${IDEOGRAPHIC_SPACE}words`)).toBe('two words');
  });

  it('caps absurd input instead of letting it through', () => {
    const long = 'a'.repeat(MAX_INPUT_LENGTH + 50);

    expect(normalizeInput(long)).toHaveLength(MAX_INPUT_LENGTH);
  });

  it('handles an empty value', () => {
    expect(normalizeInput('')).toBe('');
  });
});

describe('shouldSubmit', () => {
  it('sends a real edit', () => {
    expect(shouldSubmit('ca', 'cat')).toBe(true);
    expect(shouldSubmit('cat', 'ca')).toBe(true);
  });

  it('skips an input event that changed nothing', () => {
    expect(shouldSubmit('cat', 'cat')).toBe(false);
  });
});
