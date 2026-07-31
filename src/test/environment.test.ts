import { describe, expect, it } from 'vitest';

/**
 * Guards the test harness itself. If these fail, every other suite is unreliable.
 */
describe('test environment', () => {
  it('runs plain TypeScript modules with no DOM dependency', () => {
    const wordsPerMinute = (characters: number, seconds: number): number =>
      characters / 5 / (seconds / 60);

    expect(wordsPerMinute(100, 60)).toBe(20);
  });

  it('provides a jsdom document', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div').tagName).toBe('DIV');
  });

  it('loads jest-dom matchers from the setup file', () => {
    const element = document.createElement('p');
    element.textContent = 'ready';
    document.body.append(element);

    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent('ready');
  });
});
