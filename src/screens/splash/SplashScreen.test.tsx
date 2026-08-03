import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SplashScreen } from './SplashScreen';

describe('SplashScreen', () => {
  it('shows the title while it loads', () => {
    render(<SplashScreen onReady={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Typing Chase' })).toBeInTheDocument();
  });

  it('reports progress as a labelled progress bar', () => {
    render(<SplashScreen onReady={vi.fn()} />);

    expect(screen.getByRole('progressbar', { name: 'Loading progress' })).toBeInTheDocument();
  });

  it('states its status in text, not only as a bar', () => {
    render(<SplashScreen onReady={vi.fn()} />);

    // Nothing in the manifest is required yet, so the honest status is "Ready"
    // rather than a staged loading bar.
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('reports ready once the minimum beat has passed', async () => {
    const onReady = vi.fn();
    render(<SplashScreen onReady={onReady} minimumDurationMs={20} />);

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledTimes(1);
    });
  });

  it('can be skipped', async () => {
    const onReady = vi.fn();
    const user = userEvent.setup();
    render(<SplashScreen onReady={onReady} minimumDurationMs={100_000} />);

    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does not fire after unmounting', async () => {
    const onReady = vi.fn();
    const view = render(<SplashScreen onReady={onReady} minimumDurationMs={20} />);

    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 60));

    // A timer that outlives the screen would advance a machine that has moved on.
    expect(onReady).not.toHaveBeenCalled();
  });
});
