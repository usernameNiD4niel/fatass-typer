import { describe, expect, it, vi } from 'vitest';

import { EMPTY_LIVE_STATS, emptyRunResult, type LiveRunStats } from '../game-core/models';
import { DEFAULT_STATS_INTERVAL_MS, GameBridge, type GameHost } from './bridge';
import type { GameCommand, GameEvent } from './messages';

/** A host that records what it was asked to do and can answer with events. */
class RecordingHost implements GameHost {
  readonly commands: GameCommand[] = [];
  reply: GameEvent | null = null;

  handle(command: GameCommand, emit: (event: GameEvent) => void): void {
    this.commands.push(command);
    if (this.reply) emit(this.reply);
  }
}

function setup() {
  const host = new RecordingHost();
  const bridge = new GameBridge({ host });
  const events: GameEvent[] = [];
  const unsubscribe = bridge.subscribe((event) => events.push(event));

  return { host, bridge, events, unsubscribe };
}

function statsWith(overrides: Partial<LiveRunStats> = {}): LiveRunStats {
  return { ...EMPTY_LIVE_STATS, ...overrides };
}

const RESULT = emptyRunResult('run-1', 'map-1', '2026-01-01T00:00:00.000Z');

describe('GameBridge commands', () => {
  it('forwards a valid command to the host', () => {
    const { host, bridge } = setup();

    expect(bridge.send({ type: 'startRun' })).toBe(true);
    expect(host.commands).toEqual([{ type: 'startRun' }]);
  });

  it('turns an invalid command into a fatalError instead of throwing', () => {
    const { host, bridge, events } = setup();

    expect(bridge.send({ type: 'nonsense' })).toBe(false);
    expect(host.commands).toHaveLength(0);
    expect(events[0]?.type).toBe('fatalError');
    expect(events[0]).toMatchObject({ message: expect.stringContaining('nonsense') as string });
  });

  it('reports a missing host rather than dropping the command silently', () => {
    const bridge = new GameBridge();
    const events: GameEvent[] = [];
    bridge.subscribe((event) => events.push(event));

    expect(bridge.send({ type: 'pause' })).toBe(false);
    expect(events[0]?.type).toBe('fatalError');
  });

  it('lets the host answer with events', () => {
    const { host, bridge, events } = setup();
    host.reply = { type: 'ready' };

    bridge.send({ type: 'initialize', canvasId: 'canvas' });

    expect(events).toEqual([{ type: 'ready' }]);
  });

  it('tears itself down on a destroy command, after the host sees it', () => {
    const { host, bridge } = setup();

    bridge.send({ type: 'destroy' });

    expect(host.commands).toEqual([{ type: 'destroy' }]);
    expect(bridge.isDestroyed).toBe(true);
  });
});

describe('GameBridge subscriptions', () => {
  it('delivers events to every listener', () => {
    const { bridge } = setup();
    const first = vi.fn();
    const second = vi.fn();
    bridge.subscribe(first);
    bridge.subscribe(second);

    bridge.emit({ type: 'stateChanged', state: 'running' });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe, and tolerates unsubscribing twice', () => {
    const { bridge, events, unsubscribe } = setup();

    unsubscribe();
    unsubscribe();
    bridge.emit({ type: 'ready' });

    expect(events).toHaveLength(0);
    expect(bridge.listenerCount).toBe(0);
  });

  it('contains a throwing listener so the others still hear the event', () => {
    const { bridge } = setup();
    const healthy = vi.fn();
    bridge.subscribe(() => {
      throw new Error('a broken React component');
    });
    bridge.subscribe(healthy);

    expect(() => {
      bridge.emit({ type: 'ready' });
    }).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('lets a listener unsubscribe from inside a callback', () => {
    const { bridge, events } = setup();
    const stop = bridge.subscribe(() => {
      stop();
    });

    expect(() => {
      bridge.emit({ type: 'ready' });
    }).not.toThrow();
    expect(events).toHaveLength(1);
  });
});

describe('GameBridge stats throttling', () => {
  it('emits the first sample immediately', () => {
    const { bridge, events } = setup();

    bridge.publishStats(statsWith({ currentWpm: 20 }), 0);

    expect(events).toEqual([{ type: 'statsUpdated', stats: statsWith({ currentWpm: 20 }) }]);
  });

  it('collapses a burst of per-frame samples into one update', () => {
    const { bridge, events } = setup();

    // Six 16ms frames — a per-frame bridge would emit six times.
    for (let frame = 0; frame < 6; frame += 1) {
      bridge.publishStats(statsWith({ currentWpm: frame }), frame * 16);
    }

    expect(events).toHaveLength(1);
  });

  it('emits again once the interval has passed, with the newest sample', () => {
    const { bridge, events } = setup();

    bridge.publishStats(statsWith({ currentWpm: 1 }), 0);
    bridge.publishStats(statsWith({ currentWpm: 2 }), 50);
    bridge.publishStats(statsWith({ currentWpm: 3 }), DEFAULT_STATS_INTERVAL_MS);

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ type: 'statsUpdated', stats: statsWith({ currentWpm: 3 }) });
  });

  it('holds close to 10Hz across a simulated second of 60Hz frames', () => {
    const { bridge, events } = setup();

    for (let frame = 0; frame < 60; frame += 1) {
      bridge.publishStats(statsWith({ elapsedMs: frame * 16.7 }), frame * 16.7);
    }

    expect(events.length).toBeLessThanOrEqual(11);
    expect(events.length).toBeGreaterThanOrEqual(9);
  });

  it('flushes the withheld sample when a run ends', () => {
    const { bridge, events } = setup();

    bridge.publishStats(statsWith({ score: 10 }), 0);
    bridge.publishStats(statsWith({ score: 999 }), 20);
    bridge.emit({ type: 'levelCompleted', result: RESULT });

    expect(events[1]).toEqual({ type: 'statsUpdated', stats: statsWith({ score: 999 }) });
    expect(events[2]?.type).toBe('levelCompleted');
  });

  it('flushes before a game over too', () => {
    const { bridge, events } = setup();

    bridge.publishStats(statsWith({ score: 5 }), 0);
    bridge.publishStats(statsWith({ score: 7 }), 10);
    bridge.emit({ type: 'gameOver', result: RESULT });

    expect(events.map((event) => event.type)).toEqual(['statsUpdated', 'statsUpdated', 'gameOver']);
  });

  it('does not flush a sample it has already sent', () => {
    const { bridge, events } = setup();

    bridge.publishStats(statsWith(), 0);
    bridge.flush();
    bridge.flush();

    expect(events).toHaveLength(1);
  });

  it('keeps emitting after the caller restarts its clock', () => {
    const { bridge, events } = setup();

    // A restart puts run time back to zero. Without a reset the throttle would
    // wait for the old high-water mark and the HUD would freeze.
    bridge.publishStats(statsWith({ score: 100 }), 30_000);
    bridge.publishStats(statsWith({ score: 0 }), 0);

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ type: 'statsUpdated', stats: statsWith({ score: 0 }) });
  });

  it('honours a custom interval', () => {
    const bridge = new GameBridge({ statsIntervalMs: 500 });
    const events: GameEvent[] = [];
    bridge.subscribe((event) => events.push(event));

    bridge.publishStats(statsWith(), 0);
    bridge.publishStats(statsWith(), 200);
    bridge.publishStats(statsWith(), 600);

    expect(events).toHaveLength(2);
  });
});

describe('GameBridge dog distance', () => {
  it('emits the first reading', () => {
    const { bridge, events } = setup();

    bridge.publishDogDistance(1, 0);

    expect(events).toEqual([{ type: 'dogDistanceChanged', normalizedDistance: 1 }]);
  });

  it('ignores a change too small to see', () => {
    const { bridge, events } = setup();

    bridge.publishDogDistance(1, 0);
    bridge.publishDogDistance(0.9999, 1000);

    expect(events).toHaveLength(1);
  });

  it('recovers when the clock restarts', () => {
    const { bridge, events } = setup();

    bridge.publishDogDistance(0.4, 30_000);
    // A restart: run time back to zero, gap back to full.
    bridge.publishDogDistance(1, 0);

    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ type: 'dogDistanceChanged', normalizedDistance: 1 });
  });

  it('throttles a steadily closing gap', () => {
    const { bridge, events } = setup();

    for (let frame = 0; frame < 60; frame += 1) {
      bridge.publishDogDistance(1 - frame * 0.01, frame * 16.7);
    }

    expect(events.length).toBeLessThanOrEqual(11);
    expect(events.length).toBeGreaterThan(1);
  });
});

describe('GameBridge obstacle deadline', () => {
  it('emits the first reading', () => {
    const { bridge, events } = setup();

    bridge.publishDeadline(4_000, 'safe', 0);

    expect(events).toEqual([{ type: 'deadlineChanged', remainingMs: 4_000, pressure: 'safe' }]);
  });

  it('throttles a steady countdown', () => {
    const { bridge, events } = setup();

    for (let frame = 0; frame < 60; frame += 1) {
      bridge.publishDeadline(4_000 - frame * 16.7, 'safe', frame * 16.7);
    }

    expect(events.length).toBeLessThanOrEqual(11);
  });

  it('reports a change of pressure immediately, whatever the throttle says', () => {
    const { bridge, events } = setup();

    bridge.publishDeadline(4_000, 'safe', 0);
    // 10ms later — well inside the throttle window, but the level changed, and
    // that is exactly the moment the HUD has to react.
    bridge.publishDeadline(900, 'critical', 10);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ pressure: 'critical' });
  });

  it('says nothing when there is no deadline and there never was one', () => {
    const { bridge, events } = setup();

    bridge.publishDeadline(null, 'safe', 0);
    bridge.publishDeadline(null, 'safe', 1_000);

    expect(events).toHaveLength(0);
  });

  it('reports the deadline ending', () => {
    const { bridge, events } = setup();

    bridge.publishDeadline(500, 'critical', 0);
    bridge.publishDeadline(null, 'safe', 200);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ remainingMs: null });
  });

  it('recovers when the clock restarts', () => {
    const { bridge, events } = setup();

    bridge.publishDeadline(1_000, 'warning', 30_000);
    bridge.publishDeadline(4_000, 'warning', 0);

    expect(events).toHaveLength(2);
  });

  it('goes silent after destruction', () => {
    const { bridge, events } = setup();

    bridge.destroy();
    bridge.publishDeadline(1_000, 'critical', 0);

    expect(events).toHaveLength(0);
  });
});

describe('GameBridge destruction', () => {
  it('drops listeners so an unmounted canvas cannot be reached', () => {
    const { bridge, events } = setup();

    bridge.destroy();
    bridge.emit({ type: 'ready' });
    bridge.publishStats(statsWith(), 0);
    bridge.publishDogDistance(0.5, 0);

    expect(events).toHaveLength(0);
    expect(bridge.listenerCount).toBe(0);
  });

  it('ignores commands after destruction instead of erroring', () => {
    const { host, bridge } = setup();

    bridge.destroy();

    expect(bridge.send({ type: 'startRun' })).toBe(false);
    expect(host.commands).toHaveLength(0);
  });

  it('ignores a subscription made after destruction', () => {
    const { bridge } = setup();
    const late = vi.fn();

    bridge.destroy();
    const stop = bridge.subscribe(late);
    bridge.emit({ type: 'ready' });
    stop();

    expect(late).not.toHaveBeenCalled();
    expect(bridge.listenerCount).toBe(0);
  });

  it('is idempotent', () => {
    const { bridge } = setup();

    bridge.destroy();

    expect(() => {
      bridge.destroy();
    }).not.toThrow();
  });
});
