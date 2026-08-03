import { describe, expect, it, vi } from 'vitest';

import { GameLoop, type LoopScheduler, type LoopUpdateContext } from './game-loop';

/**
 * A hand-cranked scheduler. Frames only happen when a test asks for them, which
 * is the only way to assert catch-up and clamp behaviour without real time.
 */
class FakeScheduler implements LoopScheduler {
  currentMs = 0;
  cancelled: number[] = [];

  private pending = new Map<number, (timestampMs: number) => void>();
  private nextHandle = 1;

  now(): number {
    return this.currentMs;
  }

  request(callback: (timestampMs: number) => void): number {
    const handle = this.nextHandle++;
    this.pending.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.cancelled.push(handle);
    this.pending.delete(handle);
  }

  /** Advances the clock and delivers the single queued frame, if any. */
  advance(deltaMs: number): void {
    this.currentMs += deltaMs;
    const [entry] = [...this.pending.entries()];
    if (!entry) return;
    const [handle, callback] = entry;
    this.pending.delete(handle);
    callback(this.currentMs);
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}

function setup(timestep?: {
  fixedDeltaMs?: number;
  maxStepsPerFrame?: number;
  maxFrameMs?: number;
}) {
  const scheduler = new FakeScheduler();
  const updates: LoopUpdateContext[] = [];
  const render = vi.fn();
  const loop = new GameLoop({
    scheduler,
    timestep: { fixedDeltaMs: 10, maxFrameMs: 250, maxStepsPerFrame: 5, ...timestep },
    update: (context) => updates.push(context),
    render,
  });

  return { scheduler, updates, render, loop };
}

describe('GameLoop', () => {
  it('does nothing until started', () => {
    const { scheduler, updates, render } = setup();

    scheduler.advance(100);

    expect(updates).toHaveLength(0);
    expect(render).not.toHaveBeenCalled();
  });

  it('runs fixed-length updates and one render per frame', () => {
    const { scheduler, updates, render, loop } = setup();

    loop.start();
    scheduler.advance(30);

    expect(updates.map((u) => u.fixedDeltaMs)).toEqual([10, 10, 10]);
    expect(updates.map((u) => u.tick)).toEqual([1, 2, 3]);
    expect(updates.map((u) => u.elapsedMs)).toEqual([10, 20, 30]);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('keeps scheduling frames while running', () => {
    const { scheduler, render, loop } = setup();

    loop.start();
    scheduler.advance(10);
    scheduler.advance(10);
    scheduler.advance(10);

    expect(render).toHaveBeenCalledTimes(3);
    expect(scheduler.pendingCount).toBe(1);
  });

  it('renders frames that were too short to advance the simulation', () => {
    const { scheduler, updates, render, loop } = setup();

    loop.start();
    scheduler.advance(4);

    expect(updates).toHaveLength(0);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('keeps the simulation rate independent of the frame rate', () => {
    const slow = setup();
    const fast = setup();

    slow.loop.start();
    fast.loop.start();

    for (let frame = 0; frame < 10; frame += 1) slow.scheduler.advance(20);
    for (let frame = 0; frame < 20; frame += 1) fast.scheduler.advance(10);

    // Same 200ms of wall clock, same simulation time, despite double the frames.
    expect(slow.loop.stats.elapsedMs).toBe(200);
    expect(fast.loop.stats.elapsedMs).toBe(200);
    expect(slow.render).toHaveBeenCalledTimes(10);
    expect(fast.render).toHaveBeenCalledTimes(20);
  });

  it('passes an interpolation alpha to the renderer', () => {
    const { scheduler, render, loop } = setup();

    loop.start();
    scheduler.advance(15);

    expect(render.mock.calls[0]?.[0]).toMatchObject({ alpha: 0.5, frameDeltaMs: 15 });
  });

  it('clamps a huge frame instead of simulating it', () => {
    const { scheduler, updates, loop } = setup();

    loop.start();
    scheduler.advance(60_000); // tab restored from the background

    expect(updates).toHaveLength(5);
    expect(loop.stats.droppedMs).toBeGreaterThan(59_000);
  });

  it('stops scheduling and cancels the pending frame on stop', () => {
    const { scheduler, updates, render, loop } = setup();

    loop.start();
    scheduler.advance(10);
    loop.stop();

    expect(loop.running).toBe(false);
    expect(scheduler.pendingCount).toBe(0);
    expect(scheduler.cancelled).toHaveLength(1);

    scheduler.advance(100);
    expect(updates).toHaveLength(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('abandons the remaining steps when an update stops the loop', () => {
    const scheduler = new FakeScheduler();
    const updates: number[] = [];
    const render = vi.fn();
    const loop: GameLoop = new GameLoop({
      scheduler,
      timestep: { fixedDeltaMs: 10, maxFrameMs: 250, maxStepsPerFrame: 5 },
      update: (context) => {
        updates.push(context.tick);
        if (context.tick === 2) loop.stop(); // e.g. the dogs caught the MC
      },
      render,
    });

    loop.start();
    scheduler.advance(50);

    expect(updates).toEqual([1, 2]);
    expect(render).not.toHaveBeenCalled();
  });

  it('freezes the simulation while paused but keeps rendering', () => {
    const { scheduler, updates, render, loop } = setup();

    loop.start();
    scheduler.advance(10);
    loop.pause();
    scheduler.advance(1000);
    scheduler.advance(1000);

    expect(loop.isPaused).toBe(true);
    expect(updates).toHaveLength(1);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('resumes without paying back the paused time', () => {
    const { scheduler, updates, loop } = setup();

    loop.start();
    scheduler.advance(10);
    loop.pause();
    scheduler.advance(60_000);
    loop.resume();
    scheduler.advance(10);

    expect(updates.map((u) => u.tick)).toEqual([1, 2]);
    expect(loop.stats.elapsedMs).toBe(20);
  });

  it('ignores resume when it was never paused, and pause before start', () => {
    const { scheduler, updates, loop } = setup();

    loop.pause();
    expect(loop.isPaused).toBe(false);

    loop.start();
    loop.resume();
    scheduler.advance(10);

    expect(updates).toHaveLength(1);
  });

  it('ignores a second start while already running', () => {
    const { scheduler, updates, loop } = setup();

    loop.start();
    scheduler.advance(10);
    loop.start();
    scheduler.advance(10);

    expect(updates.map((u) => u.tick)).toEqual([1, 2]);
    expect(scheduler.pendingCount).toBe(1);
  });

  it('restarts from a clean simulation', () => {
    const { scheduler, loop } = setup();

    loop.start();
    scheduler.advance(50);
    loop.stop();
    loop.start();
    scheduler.advance(10);

    expect(loop.stats.tick).toBe(1);
    expect(loop.stats.elapsedMs).toBe(10);
    expect(loop.stats.droppedMs).toBe(0);
  });

  it('reports a smoothed frame rate', () => {
    const { scheduler, loop } = setup();

    loop.start();
    for (let frame = 0; frame < 60; frame += 1) scheduler.advance(1000 / 60);

    expect(loop.stats.fps).toBeGreaterThan(55);
    expect(loop.stats.fps).toBeLessThan(65);
  });
});
