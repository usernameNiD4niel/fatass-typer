import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EMPTY_LIVE_STATS, type LiveRunStats } from '../../game-core/models';
import { Hud } from './Hud';

function statsWith(overrides: Partial<LiveRunStats> = {}): LiveRunStats {
  return { ...EMPTY_LIVE_STATS, ...overrides };
}

describe('Hud', () => {
  const TOP_SPEED = 12;

  function setup(stats: LiveRunStats, options: { paused?: boolean; canPause?: boolean } = {}) {
    const onPause = vi.fn();
    render(
      <Hud
        stats={stats}
        topSpeedMetersPerSecond={TOP_SPEED}
        onPause={onPause}
        paused={options.paused ?? false}
        canPause={options.canPause ?? true}
      />,
    );

    return { onPause, user: userEvent.setup() };
  }

  it('shows the run readouts', () => {
    setup(statsWith({ currentWpm: 27.4, accuracy: 0.93, combo: 3, score: 1240.7 }));

    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.getByText('93%')).toBeInTheDocument();
    expect(screen.getByText('3×')).toBeInTheDocument();
    expect(screen.getByText('1241')).toBeInTheDocument();
  });

  it('shows a dash rather than a zero combo, or zero lives', () => {
    setup(statsWith({ combo: 0, shields: 0 }));

    // Combo and Lives both read as a dash when there is nothing to report; a
    // zero would look like a value the player had.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('counts lives while a shield is carried', () => {
    setup(statsWith({ shields: 2 }));

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows what is running, with a countdown', () => {
    setup(statsWith({ flightRemainingMs: 12_400, magnetRemainingMs: 3_100 }));

    expect(screen.getByText('Flying 13s')).toBeInTheDocument();
    expect(screen.getByText('Magnet 4s')).toBeInTheDocument();
  });

  it('says nothing about powerups when none are running', () => {
    setup(statsWith());

    expect(screen.queryByLabelText('Active powerups')).not.toBeInTheDocument();
  });

  it('meters progress to the finish', () => {
    setup(statsWith({ progress: 0.42 }));

    expect(screen.getByRole('progressbar', { name: 'To finish' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
  });

  it('reports speed as a number, not only as a bar', () => {
    setup(statsWith({ speedMetersPerSecond: 6.4 }));

    const meter = screen.getByRole('progressbar', { name: 'Speed' });

    // Colour and length are not enough on their own (spec §21).
    expect(meter).toHaveAttribute('aria-valuetext', '6.4 m/s');
    expect(meter).toHaveAttribute('aria-valuenow', '53');
  });

  it('never shows the word being typed — that belongs beside its hazard', () => {
    setup(statsWith({ currentWpm: 30 }));

    expect(screen.queryByText(/type/i)).not.toBeInTheDocument();
  });

  it('offers pause, and says resume while paused', async () => {
    const { user, onPause } = setup(statsWith(), { paused: true });

    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('disables pause when there is no run to pause', () => {
    setup(statsWith(), { canPause: false });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });
});
