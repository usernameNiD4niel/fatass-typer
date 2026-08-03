import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GameScreen } from './GameScreen';

/**
 * jsdom implements `<canvas>` but not a 2D context, so the runtime reports a
 * fatal error and renders nothing. That is exactly the path a locked-down
 * browser takes, and it is worth having covered: the screen must stay usable
 * and honest rather than showing a blank box.
 *
 * The simulation itself is tested headlessly in `run-session.test.ts`.
 */

describe('GameScreen', () => {
  it('renders the stage, the prompt area, and the typing field', () => {
    render(<GameScreen />);

    expect(
      screen.getByRole('img', { name: 'The runner and the chasing dogs' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows the HUD readouts the slice promises', () => {
    render(<GameScreen />);

    for (const label of ['WPM', 'Accuracy', 'Combo', 'Score', 'Finish', 'Dogs']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('explains itself when the browser has no 2D canvas context', () => {
    render(<GameScreen />);

    expect(screen.getByText(/did not provide a 2D canvas context/)).toBeInTheDocument();
  });

  it('disables typing until a run is under way', () => {
    render(<GameScreen />);

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('keeps the start control unusable while the runtime is not ready', () => {
    render(<GameScreen />);

    expect(screen.getByRole('button', { name: 'Start run' })).toBeDisabled();
  });

  it('unmounts without leaving the loop running', () => {
    const view = render(<GameScreen />);

    expect(() => {
      view.unmount();
    }).not.toThrow();
  });

  it('does not offer a pause control outside a run', () => {
    render(<GameScreen />);

    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });
});
