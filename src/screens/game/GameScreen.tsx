import { type JSX, useCallback, useEffect, useRef, useState } from 'react';

import { Hud, PauseOverlay, PromptDisplay } from '../../components/hud';
import { type CommandSink, TypingInput } from '../../components/typing-input';
import { Button } from '../../components/ui';
import { attachGame, type GameBridge } from '../../game-bridge';
import type {
  DeadlinePressureLevel,
  GameEvent,
  GameState,
  PromptViewModel,
} from '../../game-bridge/messages';
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

function formatWpm(value: number): string {
  return String(Math.round(value));
}

export interface GameScreenProps {
  /** Which map to run. Defaults to Map 1 when the caller has not chosen. */
  readonly mapId?: string;
  /**
   * The run ended. The shell decides what happens next — this screen reports
   * the outcome and stops there, so navigation stays with the state machine.
   */
  readonly onRunEnded?: (result: RunResult) => void;
  readonly onQuit?: () => void;
  readonly onRestart?: () => void;
}

export function GameScreen({
  mapId,
  onRunEnded,
  onQuit,
  onRestart,
}: GameScreenProps = {}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<GameBridge | null>(null);
  // Held in a ref so the mount effect does not re-run — and tear the runtime
  // down — every time the parent hands over a fresh callback.
  const endedRef = useRef(onRunEnded);
  endedRef.current = onRunEnded;

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<GameState>('uninitialized');
  const [prompt, setPrompt] = useState<PromptViewModel | null>(null);
  const [stats, setStats] = useState<LiveRunStats>(EMPTY_LIVE_STATS);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [deadline, setDeadline] = useState<{
    remainingMs: number | null;
    pressure: DeadlinePressureLevel;
  }>({ remainingMs: null, pressure: 'safe' });

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
          // A new prompt starts with no deadline until the runtime reports one.
          setDeadline({ remainingMs: event.prompt?.remainingMs ?? null, pressure: 'safe' });
          break;
        case 'statsUpdated':
          setStats(event.stats);
          break;
        case 'deadlineChanged':
          setDeadline({ remainingMs: event.remainingMs, pressure: event.pressure });
          break;
        case 'levelCompleted':
        case 'gameOver':
          setResult(event.result);
          endedRef.current?.(event.result);
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
          <PauseOverlay
            onResume={togglePause}
            onRestart={() => {
              if (onRestart === undefined) send({ type: 'restart' });
              else onRestart();
            }}
            onQuit={() => {
              onQuit?.();
            }}
          />
        )}
      </div>

      <PromptDisplay
        prompt={running || state === 'paused' ? prompt : null}
        typed={typed}
        deadlineMs={deadline.remainingMs}
        pressure={deadline.pressure}
        idleMessage={finished ? 'Run over' : 'Press Start when you are ready'}
      />

      <Hud
        stats={stats}
        onPause={togglePause}
        paused={state === 'paused'}
        canPause={running || state === 'paused'}
      />

      <div className={styles.controls}>
        <Button variant="primary" onClick={start} disabled={!ready}>
          {finished ? 'Run again' : 'Start run'}
        </Button>
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
