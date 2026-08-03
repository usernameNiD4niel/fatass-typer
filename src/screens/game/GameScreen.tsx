import { type JSX, useCallback, useEffect, useRef, useState } from 'react';

import { type CommandSink, TypingInput } from '../../components/typing-input';
import { Button, classes, Panel } from '../../components/ui';
import {
  attachGame,
  type GameBridge,
  type GameEvent,
  type GameState,
  type PromptViewModel,
} from '../../game-bridge';
import { findMap } from '../../content';
import { EMPTY_LIVE_STATS, type LiveRunStats, type RunResult } from '../../game-core/models';
import styles from './GameScreen.module.css';

/**
 * The playable screen (spec §19 milestone 1).
 *
 * The vertical slice: a canvas driven by the runtime, the active prompt, a
 * minimal HUD, and the typing field. Step E4 designs the real HUD and E5 the
 * results screens — this is the smallest thing that is genuinely playable.
 *
 * The component knows no game rules. It attaches a bridge to a canvas, renders
 * the events that come back, and sends commands. Per-frame data never reaches
 * it: everything below arrives at the bridge's ~10Hz.
 */

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 448;

/**
 * Stands in for the bridge on the single render before the mount effect runs.
 *
 * Nothing is playable in that frame, so dropping the command is correct — and
 * it keeps `TypingInput` free of a null check on every keystroke.
 */
const DISCONNECTED_SINK: CommandSink = { send: () => false };

/** Below this fraction of the starting gap, the dogs are a stated emergency. */
const DANGER_THRESHOLD = 0.35;

function formatWpm(value: number): string {
  return String(Math.round(value));
}

function formatAccuracy(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

export interface GameScreenProps {
  /** Which map to run. Defaults to Map 1 when the caller has not chosen. */
  readonly mapId?: string;
}

export function GameScreen({ mapId }: GameScreenProps = {}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<GameBridge | null>(null);

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<GameState>('uninitialized');
  const [prompt, setPrompt] = useState<PromptViewModel | null>(null);
  const [stats, setStats] = useState<LiveRunStats>(EMPTY_LIVE_STATS);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    const map = mapId === undefined ? undefined : findMap(mapId);

    const game = attachGame({
      canvas: canvasRef.current,
      widthPx: CANVAS_WIDTH,
      heightPx: CANVAS_HEIGHT,
      devicePixelRatio: window.devicePixelRatio,
      // An unknown id falls back to the default map rather than failing to
      // start: the run matters more than the routing mistake behind it.
      ...(map === undefined ? {} : { map }),
    });

    bridgeRef.current = game.bridge;

    const unsubscribe = game.bridge.subscribe((event: GameEvent) => {
      switch (event.type) {
        case 'ready':
          setReady(true);
          break;
        case 'stateChanged':
          setState(event.state);
          break;
        case 'promptChanged':
          setPrompt(event.prompt);
          setTyped('');
          break;
        case 'statsUpdated':
          setStats(event.stats);
          break;
        case 'levelCompleted':
        case 'gameOver':
          setResult(event.result);
          break;
        case 'fatalError':
          setError(event.message);
          break;
        default:
          break;
      }
    });

    game.bridge.send({ type: 'initialize', canvasId: 'game-canvas' });

    // Everything is torn down together: a leaked loop would keep rendering into
    // a detached canvas and hold the whole run in memory.
    return () => {
      unsubscribe();
      game.destroy();
      bridgeRef.current = null;
    };
    // Changing map tears the runtime down and builds a new one: a run belongs to
    // exactly one map, and swapping it underneath a live loop would be worse.
  }, [mapId]);

  const send = useCallback((command: Parameters<GameBridge['send']>[0]) => {
    bridgeRef.current?.send(command);
  }, []);

  const running = state === 'running';
  const finished = state === 'levelComplete' || state === 'gameOver';

  const togglePause = useCallback(() => {
    if (state === 'running') send({ type: 'pause' });
    else if (state === 'paused') send({ type: 'resume' });
  }, [state, send]);

  const start = useCallback(() => {
    setResult(null);
    send(finished ? { type: 'restart' } : { type: 'startRun' });
  }, [finished, send]);

  // Escape pauses from anywhere on the screen, not only from the typing field —
  // a player who clicked away still expects it to work (spec §4).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      // The field handles its own Escape; reacting twice would toggle back.
      if (event.target instanceof HTMLInputElement) return;

      togglePause();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [togglePause]);

  return (
    <section className={styles.screen} aria-label="Typing Chase run">
      <div className={styles.stage}>
        <canvas
          ref={canvasRef}
          id="game-canvas"
          className={styles.canvas}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          role="img"
          aria-label="The runner and the chasing dogs"
        />
        {error !== null && <p className={styles.error}>{error}</p>}
        {state === 'paused' && (
          <div className={styles.overlay}>
            <Panel tight role="status">
              Paused — press Escape to resume
            </Panel>
          </div>
        )}
      </div>

      <p className={styles.prompt} aria-live="polite">
        {prompt ? prompt.text : 'No prompt'}
      </p>

      <dl className={styles.hud}>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>WPM</dt>
          <dd className={styles.statValue}>{formatWpm(stats.currentWpm)}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Accuracy</dt>
          <dd className={styles.statValue}>{formatAccuracy(stats.accuracy)}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Combo</dt>
          <dd className={styles.statValue}>{stats.combo}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Score</dt>
          <dd className={styles.statValue}>{Math.round(stats.score)}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Finish</dt>
          <dd className={styles.statValue}>{formatAccuracy(stats.progress)}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>Dogs</dt>
          {/* Text, not just colour: the danger has to survive colour-blindness. */}
          <dd
            className={classes(
              styles.statValue,
              stats.dogDistanceNormalized < DANGER_THRESHOLD && styles.danger,
            )}
          >
            {stats.dogDistanceNormalized < DANGER_THRESHOLD
              ? 'Closing!'
              : formatAccuracy(stats.dogDistanceNormalized)}
          </dd>
        </div>
      </dl>

      <div className={styles.controls}>
        <Button variant="primary" onClick={start} disabled={!ready}>
          {finished ? 'Run again' : 'Start run'}
        </Button>
        {(running || state === 'paused') && (
          <Button onClick={togglePause}>{state === 'paused' ? 'Resume' : 'Pause'}</Button>
        )}
      </div>

      <TypingInput
        bridge={bridgeRef.current ?? DISCONNECTED_SINK}
        disabled={!running}
        promptId={prompt?.promptId ?? null}
        label={prompt ? `Type: ${prompt.text}` : 'Type the prompt'}
        onValueChange={setTyped}
        onEscape={togglePause}
      />

      <p aria-live="polite">
        {result === null
          ? `Typed: ${typed}`
          : result.completed
            ? `Finished! Score ${String(Math.round(result.score))} at ${formatWpm(result.averageWpm)} WPM.`
            : `Caught by the dogs. Score ${String(Math.round(result.score))}.`}
      </p>
    </section>
  );
}
