import { describe, expect, it } from 'vitest';

import {
  advanceMcAnimation,
  createMcAnimation,
  crouchRatio,
  isTerminal,
  locomotionFor,
  MC_ANIMATION_STATES,
  type McAnimation,
  play,
  setLocomotion,
  stateDurationMs,
  verticalOffsetRatio,
} from './mc-animation';

function advance(animation: McAnimation, deltaMs: number, speed = 6): McAnimation {
  return advanceMcAnimation(animation, { deltaMs, speedMetersPerSecond: speed });
}

/** Runs the animation forward in 16ms frames, as the render loop would. */
function run(animation: McAnimation, totalMs: number, speed = 6): McAnimation {
  let current = animation;
  for (let elapsed = 0; elapsed < totalMs; elapsed += 16) {
    current = advance(current, 16, speed);
  }

  return current;
}

describe('locomotionFor', () => {
  it('reads the boost from the rules, not from a speed threshold', () => {
    expect(locomotionFor(4, true)).toBe('boosting');
    // A fast map at base speed is still ordinary running.
    expect(locomotionFor(12, false)).toBe('running');
  });

  it('is idle when stopped', () => {
    expect(locomotionFor(0, false)).toBe('idle');
  });
});

describe('McAnimation state machine', () => {
  it('starts idle', () => {
    expect(createMcAnimation().state).toBe('idle');
  });

  it('switches locomotion immediately when nothing is playing', () => {
    expect(setLocomotion(createMcAnimation(), 'running').state).toBe('running');
  });

  it('returns to the queued locomotion after a one-shot finishes', () => {
    const jumping = play(setLocomotion(createMcAnimation(), 'running'), 'jumping');
    const landed = run(jumping, stateDurationMs('jumping') + 32);

    expect(jumping.state).toBe('jumping');
    expect(landed.state).toBe('running');
    expect(landed.progress).toBe(0);
  });

  it('does not interrupt a one-shot when locomotion changes underneath it', () => {
    const jumping = play(setLocomotion(createMcAnimation(), 'boosting'), 'jumping');
    const boostExpired = setLocomotion(jumping, 'running');

    expect(boostExpired.state).toBe('jumping');
    expect(run(boostExpired, stateDurationMs('jumping') + 32).state).toBe('running');
  });

  it('reports progress through a one-shot', () => {
    const sliding = play(createMcAnimation(), 'sliding');
    const halfway = advance(sliding, stateDurationMs('sliding') / 2);

    expect(halfway.progress).toBeCloseTo(0.5, 1);
  });

  it('lets a collision cut a jump short', () => {
    const jumping = play(createMcAnimation(), 'jumping');
    const struck = play(jumping, 'hit');

    expect(struck.state).toBe('hit');
    expect(struck.elapsedMs).toBe(0);
  });

  it('does not let a cosmetic move hide a collision', () => {
    const struck = play(createMcAnimation(), 'hit');

    expect(play(struck, 'jumping').state).toBe('hit');
    expect(play(struck, 'stumbling').state).toBe('hit');
  });

  it('holds terminal states forever', () => {
    for (const terminal of ['victory', 'caught'] as const) {
      const ended = play(createMcAnimation(), terminal);

      expect(isTerminal(ended)).toBe(true);
      expect(run(ended, 10_000).state).toBe(terminal);
      expect(play(ended, 'running').state).toBe(terminal);
      expect(play(ended, 'hit').state).toBe(terminal);
    }
  });

  it('keeps the locomotion target while a terminal state plays', () => {
    const caught = setLocomotion(play(createMcAnimation(), 'caught'), 'running');

    expect(caught.state).toBe('caught');
    expect(caught.locomotion).toBe('running');
  });

  it('accepts every declared state', () => {
    for (const state of MC_ANIMATION_STATES) {
      const played = play(createMcAnimation(), state);

      expect(played.state).toBe(state);
    }
  });
});

describe('run cycle', () => {
  it('is driven by distance, so speed sets the leg rate', () => {
    const slow = run(setLocomotion(createMcAnimation(), 'running'), 1000, 4);
    const fast = run(setLocomotion(createMcAnimation(), 'running'), 1000, 8);

    // Twice the speed covers twice the strides in the same wall-clock second.
    expect(fast.cyclePhase).not.toBeCloseTo(slow.cyclePhase);
  });

  it('covers exactly one stride cycle per stride length', () => {
    // 2.2m of stride at 2.2 m/s is one full cycle per second.
    const oneSecond = advance(setLocomotion(createMcAnimation(), 'running'), 1000, 2.2);

    expect(oneSecond.cyclePhase).toBeCloseTo(0, 5);
  });

  it('stays within 0..1', () => {
    let animation = setLocomotion(createMcAnimation(), 'running');

    for (let frame = 0; frame < 200; frame += 1) {
      animation = advance(animation, 16, 9);
      expect(animation.cyclePhase).toBeGreaterThanOrEqual(0);
      expect(animation.cyclePhase).toBeLessThan(1);
    }
  });

  it('breathes on a clock while standing still', () => {
    const idle = advance(createMcAnimation(), 700, 0);

    expect(idle.cyclePhase).toBeCloseTo(0.5, 5);
  });

  it('keeps the cycle running underneath a one-shot so legs do not reset', () => {
    const running = run(setLocomotion(createMcAnimation(), 'running'), 500);
    const jumping = advance(play(running, 'jumping'), 16);

    expect(jumping.cyclePhase).not.toBe(running.cyclePhase);
  });

  it('ignores a negative frame delta', () => {
    const animation = run(setLocomotion(createMcAnimation(), 'running'), 200);

    expect(advance(animation, -50).cyclePhase).toBe(animation.cyclePhase);
  });
});

describe('pose helpers', () => {
  it('arcs the jump up and back down', () => {
    const jumping = play(createMcAnimation(), 'jumping');
    const duration = stateDurationMs('jumping');

    expect(verticalOffsetRatio(jumping)).toBeCloseTo(0);
    expect(verticalOffsetRatio(advance(jumping, duration / 2))).toBeCloseTo(1, 1);
    expect(verticalOffsetRatio(advance(jumping, duration * 0.9))).toBeLessThan(0.4);
  });

  it('leaves the ground only while jumping', () => {
    for (const state of MC_ANIMATION_STATES) {
      if (state === 'jumping') continue;

      expect(verticalOffsetRatio(play(createMcAnimation(), state))).toBe(0);
    }
  });

  it('crouches only while sliding, and fully in the middle', () => {
    const sliding = play(createMcAnimation(), 'sliding');

    expect(crouchRatio(sliding)).toBe(0);
    expect(crouchRatio(advance(sliding, stateDurationMs('sliding') / 2))).toBe(1);
    expect(crouchRatio(play(createMcAnimation(), 'running'))).toBe(0);
  });
});
