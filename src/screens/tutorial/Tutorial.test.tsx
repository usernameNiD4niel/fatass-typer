import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Tutorial } from './Tutorial';

describe('Tutorial', () => {
  it('shows nothing when it has been seen', () => {
    render(<Tutorial open={false} onDismiss={vi.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains the things a new player needs', () => {
    render(<Tutorial open onDismiss={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'How Typing Chase works' })).toBeInTheDocument();
    expect(screen.getByText(/one word sits in front of you/i)).toBeInTheDocument();
    expect(screen.getByText(/only way to lose/)).toBeInTheDocument();
    expect(screen.getByText(/breaks your combo/)).toBeInTheDocument();
    expect(screen.getByText(/The run freezes/)).toBeInTheDocument();
  });

  it('is dismissed by the primary action', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Tutorial open onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Got it' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('can be skipped outright', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Tutorial open onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Skip the tutorial' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape, like any other dialog', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<Tutorial open onDismiss={onDismiss} />);

    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
