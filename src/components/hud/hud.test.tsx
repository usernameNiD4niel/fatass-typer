import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PromptViewModel } from '../../game-bridge/messages';
import { EMPTY_LIVE_STATS, type LiveRunStats } from '../../game-core/models';
import { Hud } from './Hud';
import { PromptDisplay } from './PromptDisplay';
import { threatLevel } from './threat';

const BOOST_PROMPT: PromptViewModel = {
  promptId: 'p-1',
  text: 'garden',
  typedLength: 0,
  mistakeCount: 0,
  kind: 'boost',
  remainingMs: null,
};

const OBSTACLE_PROMPT: PromptViewModel = {
  ...BOOST_PROMPT,
  promptId: 'p-2',
  text: 'crate',
  kind: 'obstacle',
  remainingMs: 4000,
};

function statsWith(overrides: Partial<LiveRunStats> = {}): LiveRunStats {
  return { ...EMPTY_LIVE_STATS, ...overrides };
}

/** The rendered per-character classes, in order. */
function characterClasses(): string[] {
  const prompt = screen.getByLabelText(/^Type: /);

  return [...prompt.querySelectorAll('span')].map((span) => span.className);
}

describe('threatLevel', () => {
  it('reads the gap the way a player feels it', () => {
    expect(threatLevel(1)).toBe('safe');
    expect(threatLevel(0.5)).toBe('safe');
    expect(threatLevel(0.35)).toBe('closing');
    expect(threatLevel(0.15)).toBe('critical');
    expect(threatLevel(0)).toBe('caught');
  });
});

describe('PromptDisplay', () => {
  it('shows the prompt text', () => {
    render(<PromptDisplay prompt={BOOST_PROMPT} typed="" />);

    expect(screen.getByLabelText('Type: garden')).toBeInTheDocument();
  });

  it('marks correct, incorrect, current, and untyped characters differently', () => {
    render(<PromptDisplay prompt={BOOST_PROMPT} typed="gax" />);
    const classNames = characterClasses();

    // g a x d e n  →  correct correct incorrect current untyped untyped
    expect(classNames[0]).toContain('correct');
    expect(classNames[1]).toContain('correct');
    expect(classNames[2]).toContain('incorrect');
    expect(classNames[3]).toContain('current');
    expect(classNames[4]).toContain('untyped');
  });

  it('agrees with the typing engine about what is correct', () => {
    // Case-insensitive by default (spec §5), so this is a correct character.
    render(<PromptDisplay prompt={BOOST_PROMPT} typed="G" />);

    expect(characterClasses()[0]).toContain('correct');
  });

  it('tells the player which kind of prompt this is', () => {
    const view = render(<PromptDisplay prompt={BOOST_PROMPT} typed="" />);
    expect(screen.getByText('Boost prompt')).toBeInTheDocument();

    view.rerender(<PromptDisplay prompt={OBSTACLE_PROMPT} typed="" />);
    expect(screen.getByText(/Obstacle/)).toBeInTheDocument();
  });

  it('shows a deadline only for obstacle prompts', () => {
    const view = render(
      <PromptDisplay prompt={BOOST_PROMPT} typed="" deadlineMs={2000} pressure="warning" />,
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    view.rerender(
      <PromptDisplay prompt={OBSTACLE_PROMPT} typed="" deadlineMs={2000} pressure="warning" />,
    );

    expect(
      screen.getByRole('progressbar', { name: 'Time left to type this prompt' }),
    ).toBeInTheDocument();
  });

  it('states the time left as a number as well as a bar', () => {
    render(
      <PromptDisplay prompt={OBSTACLE_PROMPT} typed="" deadlineMs={1500} pressure="critical" />,
    );

    expect(screen.getByText('1.5s left')).toBeInTheDocument();
  });

  it('drains the bar as the deadline closes', () => {
    const view = render(
      <PromptDisplay prompt={OBSTACLE_PROMPT} typed="" deadlineMs={4000} pressure="safe" />,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

    view.rerender(
      <PromptDisplay prompt={OBSTACLE_PROMPT} typed="" deadlineMs={1000} pressure="critical" />,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('never shows a negative countdown', () => {
    render(
      <PromptDisplay prompt={OBSTACLE_PROMPT} typed="" deadlineMs={-500} pressure="expired" />,
    );

    expect(screen.getByText('0.0s left')).toBeInTheDocument();
  });

  it('says something useful when there is no prompt', () => {
    render(<PromptDisplay prompt={null} typed="" idleMessage="Press Start when you are ready" />);

    expect(screen.getByText('Press Start when you are ready')).toBeInTheDocument();
  });
});

describe('Hud', () => {
  function setup(stats: LiveRunStats, options: { paused?: boolean; canPause?: boolean } = {}) {
    const onPause = vi.fn();
    render(
      <Hud
        stats={stats}
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

  it('shows a dash rather than a zero combo', () => {
    setup(statsWith({ combo: 0 }));

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('meters progress to the finish', () => {
    setup(statsWith({ progress: 0.42 }));

    expect(screen.getByRole('progressbar', { name: 'To finish' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
  });

  it('describes the dogs in words, not only colour', () => {
    const view = render(
      <Hud
        stats={statsWith({ dogDistanceNormalized: 1 })}
        onPause={vi.fn()}
        paused={false}
        canPause
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Dogs' })).toHaveAttribute(
      'aria-valuetext',
      'Safe',
    );

    view.rerender(
      <Hud
        stats={statsWith({ dogDistanceNormalized: 0.1 })}
        onPause={vi.fn()}
        paused={false}
        canPause
      />,
    );

    expect(screen.getByText('Right behind you')).toBeInTheDocument();
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
