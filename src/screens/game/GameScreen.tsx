import { type JSX, useCallback, useEffect, useRef, useState } from 'react';

import {
  announcementFor,
  Hud,
  PauseOverlay,
  PromptDisplay,
  type RunMoment,
  shouldAnnounceThreat,
  type ThreatLevel,
  threatLevel,
} from '../../components/hud';
import { type CommandSink, TypingInput } from '../../components/typing-input';
import { Button, classes, VisuallyHidden } from '../../components/ui';
import { attachGame, type GameBridge } from '../../game-bridge';
import type {
  DeadlinePressureLevel,
  GameEvent,
  GameState,
  PromptViewModel,
} from '../../game-bridge/messages';
import type { GameAudio } from '../../hooks/useGameAudio';
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

/**
 * Size the canvas starts at, before the first measurement.
 *
 * The run fills the browser viewport, so the real size comes from the element
 * itself — but a canvas needs *a* size to be created with, and a stage that
 * flashed at the wrong aspect ratio for one frame would be visible.
 */
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;

/**
 * Stands in for the bridge on the single render before the mount effect runs.
 *
 * Nothing is playable in that frame, so dropping the command is correct — and
 * it keeps `TypingInput` free of a null check on every keystroke.
 */
const DISCONNECTED_SINK: CommandSink = { send: () => false };

/**
 * A non-breaking space, appended and removed in turn.
 *
 * A live region only speaks when its text actually changes, so two collisions
 * in a row would otherwise produce a single announcement. This character is not
 * spoken, so alternating it costs nothing and fixes that.
 */
const NUDGE = '\u00a0';

function formatWpm(value: number): string {
  return String(Math.round(value));
}

export interface GameScreenProps {
  /** Which map to run. Defaults to Map 1 when the caller has not chosen. */
  readonly mapId?: string;
  /**
   * Fixes the run's prompt sequence. Omitted in play, where every run gets a
   * fresh seed — otherwise the second attempt at a map is word-for-word the
   * first. Tests and bug reports pass one to get a run back.
   */
  readonly seed?: string;
  /** The app's audio. Absent means a silent run, which is always acceptable. */
  readonly audio?: GameAudio;
  /**
   * Holds the decorative background still (spec §12). The run still scrolls —
   * that is the game — but the parallax stops swimming behind it.
   */
  readonly reducedMotion?: boolean;
  /**
   * The run ended. The shell decides what happens next — this screen reports
   * the outcome and stops there, so navigation stays with the state machine.
   */
  readonly onRunEnded?: (result: RunResult) => void;
  readonly onQuit?: () => void;
  /** Notified after a restart. The runtime is restarted here regardless. */
  readonly onRestart?: () => void;
  /**
   * The *runtime* paused or resumed.
   *
   * The shell needs this because pausing happens down here — Escape, or the HUD
   * control — while the state machine is what decides whether quitting or
   * restarting is legal. Without it the two drift apart and the pause overlay
   * offers buttons the machine then rejects.
   */
  readonly onPauseChange?: (paused: boolean) => void;
}

export function GameScreen({
  mapId,
  seed,
  audio,
  reducedMotion = false,
  onRunEnded,
  onQuit,
  onRestart,
  onPauseChange,
}: GameScreenProps = {}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<GameBridge | null>(null);
  // Held in a ref so the mount effect does not re-run — and tear the runtime
  // down — every time the parent hands over a fresh callback.
  const endedRef = useRef(onRunEnded);
  endedRef.current = onRunEnded;
  // Same reasoning: the mount effect must not re-run — and tear the runtime
  // down — because a parent handed over a fresh audio object.
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const pauseChangeRef = useRef(onPauseChange);
  pauseChangeRef.current = onPauseChange;
  const typedRef = useRef('');
  // The last threat level announced, so a player hovering on a boundary is not
  // told about it forty times (spec §12).
  const threatRef = useRef<ThreatLevel>('safe');

  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
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

  /**
   * Says something once, in the run's live region.
   *
   * The trailing space alternates because a live region only speaks when its
   * text actually changes: two collisions in a row would otherwise produce one
   * announcement. The character is not spoken, so it costs nothing.
   */
  const announce = useCallback((moment: RunMoment) => {
    setAnnouncement((previous) => {
      const text = announcementFor(moment);

      return previous.endsWith(NUDGE) ? text : `${text}${NUDGE}`;
    });
  }, []);

  useEffect(() => {
    const map = mapId === undefined ? undefined : findMap(mapId);

    const canvas = canvasRef.current;
    const bounds = canvas?.getBoundingClientRect();

    const game = attachGame({
      canvas,
      widthPx: Math.round(bounds?.width ?? FALLBACK_WIDTH) || FALLBACK_WIDTH,
      heightPx: Math.round(bounds?.height ?? FALLBACK_HEIGHT) || FALLBACK_HEIGHT,
      devicePixelRatio: window.devicePixelRatio,
      reducedMotion,
      // A new seed per run. The clock is read here, at the edge, because
      // `game-core` may not read one (CLAUDE.md §3).
      seed: seed ?? `run-${String(Date.now())}`,
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
          // Kept in step with the shell, so the machine's idea of "paused"
          // matches the runtime's.
          if (event.state === 'paused') pauseChangeRef.current?.(true);
          else if (event.state === 'running') pauseChangeRef.current?.(false);
          break;
        case 'promptChanged':
          setPrompt(event.prompt);
          setTyped('');
          typedRef.current = '';
          // A new prompt starts with no deadline until the runtime reports one.
          setDeadline({ remainingMs: event.prompt?.remainingMs ?? null, pressure: 'safe' });
          break;
        case 'statsUpdated': {
          setStats(event.stats);
          // The danger layer follows the gap, at the bridge's ~10Hz.
          audioRef.current?.setDanger(1 - event.stats.dogDistanceNormalized);

          // The dogs are behind the runner and off to the side of everything a
          // screen reader can see, so the chase is narrated when it changes.
          const level = threatLevel(event.stats.dogDistanceNormalized);
          if (shouldAnnounceThreat(threatRef.current, level)) {
            threatRef.current = level;
            announce({ kind: 'threat', level });
          }
          break;
        }
        case 'obstacleWarning':
          audioRef.current?.play('obstacleWarning');
          announce({ kind: 'obstacleWarning' });
          break;
        case 'playerHit':
          audioRef.current?.play(event.reason === 'stumbled' ? 'stumble' : 'collision');
          announce({ kind: 'hit', reason: event.reason === 'stumbled' ? 'stumbled' : 'collided' });
          break;
        case 'deadlineChanged':
          setDeadline({ remainingMs: event.remainingMs, pressure: event.pressure });
          break;
        case 'levelCompleted':
        case 'gameOver':
          setResult(event.result);
          announce({
            kind: 'finished',
            completed: event.result.completed,
            score: event.result.score,
            wpm: event.result.averageWpm,
          });
          audioRef.current?.setDanger(0);
          audioRef.current?.play(event.type === 'levelCompleted' ? 'victory' : 'gameOver');
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

    /*
     * The canvas follows the window.
     *
     * A `ResizeObserver` rather than a `resize` listener: the element can change
     * size without the window doing so — a scrollbar appearing is enough — and
     * a stretched backing store is the most visible bug a canvas can have.
     */
    const observer =
      canvas === null || typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry === undefined) return;

            const { width, height } = entry.contentRect;
            if (width < 1 || height < 1) return;

            game.resize(Math.round(width), Math.round(height), window.devicePixelRatio);
          });

    if (canvas !== null) observer?.observe(canvas);

    // Everything is torn down together: a leaked loop would keep rendering into
    // a detached canvas and hold the whole run in memory.
    return () => {
      observer?.disconnect();
      unsubscribe();
      game.destroy();
      bridgeRef.current = null;
    };
    // Changing map tears the runtime down and builds a new one: a run belongs to
    // exactly one map, and swapping it underneath a live loop would be worse.
    // Changing the motion preference rebuilds the runtime, which is why it is
    // a setting rather than a mid-run control: the player is in Settings when
    // they change it, not on the road.
  }, [mapId, seed, reducedMotion, announce]);

  const send = useCallback((command: Parameters<GameBridge['send']>[0]) => {
    bridgeRef.current?.send(command);
  }, []);

  const running = state === 'running';
  const finished = state === 'levelComplete' || state === 'gameOver';

  const togglePause = useCallback(() => {
    if (state === 'running') {
      send({ type: 'pause' });
      announce({ kind: 'paused' });
    } else if (state === 'paused') {
      send({ type: 'resume' });
      announce({ kind: 'resumed' });
    }
  }, [state, send, announce]);

  const start = useCallback(() => {
    setResult(null);
    threatRef.current = 'safe';
    // This is a click, so it is a legitimate moment to start the audio context.
    audioRef.current?.unlock();
    audioRef.current?.setTrack('running');
    send(finished ? { type: 'restart' } : { type: 'startRun' });
    announce({ kind: 'started' });
  }, [finished, send, announce]);

  /**
   * Restart, from the keyboard, from anywhere on the screen (spec §12).
   *
   * Ctrl or Cmd with Enter rather than a bare letter: the typing field owns
   * every printable key, and a shortcut that fires mid-prompt would be a trap.
   */
  const restart = useCallback(() => {
    threatRef.current = 'safe';
    setResult(null);

    // The runtime is restarted here, always. Leaving it to the shell was a bug
    // the e2e tests caught: the screen said "restarted" while the same run
    // carried on underneath.
    send({ type: 'restart' });
    onRestart?.();

    announce({ kind: 'started' });
  }, [onRestart, send, announce]);

  /**
   * Per-character feedback (spec §11).
   *
   * Driven from the field's own value rather than a bridge event: keystrokes
   * happen at typing speed, and pushing one event per character through a
   * bridge that exists to throttle traffic would be working against it.
   */
  const handleTyped = useCallback(
    (value: string) => {
      const previous = typedRef.current;
      typedRef.current = value;
      setTyped(value);

      if (value.length <= previous.length) return;

      const target = prompt?.text ?? '';
      const correct = target.slice(0, value.length).toLowerCase() === value.toLowerCase();

      if (!correct) {
        audioRef.current?.play('mistake');

        return;
      }

      // A completed prompt gets its own sound; the last correct character does
      // not also click, or the two would collide.
      audioRef.current?.play(value.length === target.length ? 'promptComplete' : 'keystroke');
    },
    [prompt],
  );

  // Escape pauses from anywhere on the screen, not only from the typing field —
  // a player who clicked away still expects it to work (spec §4).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // Ctrl/Cmd+Enter restarts, including from inside the typing field: the
      // modifier is what makes it safe to listen for there.
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        restart();

        return;
      }

      if (event.key !== 'Escape') return;
      // The field handles its own Escape; reacting twice would toggle back.
      if (event.target instanceof HTMLInputElement) return;

      togglePause();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [togglePause, restart]);

  return (
    <section className={styles.screen} aria-label="Typing Chase run">
      <canvas
        ref={canvasRef}
        id="game-canvas"
        className={styles.canvas}
        role="img"
        aria-label="The runner, the track ahead, and the chasing dogs"
      />

      {/*
        Everything below floats over the canvas and lets clicks through, except
        the controls themselves. The grid is three rows: readouts up top, the
        occasional message in the middle, the prompt where the eye already is.
      */}
      <div className={styles.overlay}>
        <div className={styles.topBar}>
          <Hud
            stats={stats}
            onPause={togglePause}
            paused={state === 'paused'}
            canPause={running || state === 'paused'}
          />
        </div>

        <div className={styles.middle}>
          {error !== null && <p className={classes(styles.banner, styles.error)}>{error}</p>}
          {result !== null && (
            <p className={styles.outcome}>
              {result.completed
                ? `Finished! Score ${String(Math.round(result.score))} at ${formatWpm(result.averageWpm)} WPM.`
                : `Caught by the dogs. Score ${String(Math.round(result.score))}.`}
            </p>
          )}
        </div>

        <div className={styles.bottom}>
          <div className={styles.console}>
            <PromptDisplay
              prompt={running || state === 'paused' ? prompt : null}
              typed={typed}
              deadlineMs={deadline.remainingMs}
              pressure={deadline.pressure}
              idleMessage={finished ? 'Run over' : 'Press Start when you are ready'}
            />

            <TypingInput
              bridge={bridgeRef.current ?? DISCONNECTED_SINK}
              disabled={!running}
              promptId={prompt?.promptId ?? null}
              label={prompt ? `Type: ${prompt.text}` : 'Type the prompt'}
              onValueChange={handleTyped}
              onEscape={togglePause}
            />
          </div>

          <div className={styles.controls}>
            {!running && (
              <Button variant="primary" onClick={start} disabled={!ready}>
                {finished ? 'Run again' : 'Start run'}
              </Button>
            )}
            {/* Stated, not hidden in a tutorial the player saw once (spec §12). */}
            <p className={styles.shortcuts}>
              <kbd>Esc</kbd> pause · <kbd>Ctrl</kbd> + <kbd>Enter</kbd> restart
            </p>
          </div>
        </div>
      </div>

      {state === 'paused' && (
        <PauseOverlay
          onResume={togglePause}
          onRestart={restart}
          onQuit={() => {
            onQuit?.();
          }}
        />
      )}

      {/*
        The run's one live region. It narrates moments — a warning, a collision,
        the dogs closing, the end — and never keystrokes: a region that updated
        per character would be a screen reader that never stops talking.
      */}
      <VisuallyHidden live="polite">{announcement}</VisuallyHidden>
    </section>
  );
}
