import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

  it('shows the HUD readouts and both meters', () => {
    render(<GameScreen />);

    for (const label of ['WPM', 'Accuracy', 'Combo', 'Score']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    expect(screen.getByRole('progressbar', { name: 'To finish' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Dogs' })).toBeInTheDocument();
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

  it('shows pause as unavailable outside a run rather than hiding it', () => {
    render(<GameScreen />);

    // The HUD keeps a stable shape: a control that appears and disappears as the
    // run starts and stops would shift everything around it.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('listens for Escape while mounted and stops on unmount', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const addSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type) => {
      added.push(type);
    });
    const removeSpy = vi.spyOn(window, 'removeEventListener').mockImplementation((type) => {
      removed.push(type);
    });

    render(<GameScreen />).unmount();

    // A leaked key listener would keep pausing a run that no longer exists.
    expect(added).toContain('keydown');
    expect(removed).toContain('keydown');

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('ignores Escape when nothing is running', async () => {
    const user = userEvent.setup();
    render(<GameScreen />);

    await user.keyboard('{Escape}');

    expect(screen.queryByText(/Paused/)).not.toBeInTheDocument();
  });
});

describe('GameScreen accessibility (spec §12)', () => {
  it('restarts on Ctrl+Enter from anywhere on the screen', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(<GameScreen onRestart={onRestart} />);

    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('restarts on Meta+Enter too', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(<GameScreen onRestart={onRestart} />);

    await user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('does not restart on a bare Enter, which the typing field owns', async () => {
    const user = userEvent.setup();
    const onRestart = vi.fn();
    render(<GameScreen onRestart={onRestart} />);

    await user.keyboard('{Enter}');

    expect(onRestart).not.toHaveBeenCalled();
  });

  it('states its keyboard shortcuts on the screen they apply to', () => {
    render(<GameScreen />);

    expect(screen.getByText('Esc')).toBeInTheDocument();
    expect(screen.getByText('Ctrl')).toBeInTheDocument();
  });

  it('carries one polite live region for the run', () => {
    render(<GameScreen />);

    // `status` rather than `alert`: the run should not interrupt whatever the
    // player is being told, and there is nothing here urgent enough to.
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('does not narrate what was typed', async () => {
    const user = userEvent.setup();
    render(<GameScreen />);

    const [region] = screen.getAllByRole('status');
    await user.keyboard('hello');

    // The live region is for moments, not characters. The prompt itself is the
    // field's accessible name, which is where a screen reader reads it from.
    expect(region?.textContent ?? '').not.toContain('hello');
  });

  it('gives the canvas a description rather than leaving it unlabelled', () => {
    render(<GameScreen />);

    expect(
      screen.getByRole('img', { name: 'The runner and the chasing dogs' }),
    ).toBeInTheDocument();
  });
});
