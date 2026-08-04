import { type JSX, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { announcementFor, Hud, PauseOverlay, type RunMoment } from '../../components/hud';
import { Button, classes, VisuallyHidden } from '../../components/ui';
import { attachGame, type AttachedGame, type GameBridge } from '../../game-bridge';
import type { GameEvent, GameState, PromptViewModel } from '../../game-bridge/messages';
import type { GameAudio } from '../../hooks/useGameAudio';
import { useTypingCapture } from '../../hooks/useTypingCapture';
import { findMap, MAP_1 } from '../../content';
import { EMPTY_LIVE_STATS, type LiveRunStats, type RunResult } from '../../game-core/models';
import styles from './GameScreen.module.css';

/**
 * The playable screen.
 *
 * The run fills the viewport: a Three.js scene with the HUD and the pause
 * overlay floating on glass above it. There is no typing box and no prompt
 * console — the word lives in the world beside the hazard it applies to, and
 * the keyboard is captured globally while the run is going (spec §2, §15).
 *
 * The component knows no game rules. It attaches a bridge, renders the events
 * that come back, and sends commands. Per-frame data never reaches it:
 * everything below arrives at the bridge's ~10Hz, and the scene reads the world
 * directly through a snapshot React never sees.
 */

/**
 * The scene is loaded on demand.
 *
 * Three.js is several hundred kilobytes and only this screen needs it. Splitting
 * it here means the menu still loads in tens of kilobytes, and the 3D arrives
 * when a player actually goes to play (spec §20).
 */
const GameCanvas = lazy(async () => {
  const module = await import('../../game-scene');

  return { default: module.GameCanvas };
});

/**
 * A non-breaking space, appended and removed in turn.
 *
 * A live region only speaks when its text actually changes, so two collisions in
 * a row would otherwise produce a single announcement. This character is not
 * spoken, so alternating it costs nothing and fixes that.
 */
const NUDGE = ' ';

function formatWpm(value: number): string {
  return String(Math.round(value));
}

export interface GameScreenProps {
  /** Which map to run. Defaults to Map 1 when the caller has not chosen. */
  readonly mapId?: string;
  /**
   * Furthest the player has ever got on this map, in metres.
   *
   * Passed in rather than read here: the HUD shows it beside the live distance
   * and the scene draws it on the road, and both want the number the profile
   * held when the run *started* — a best that updated mid-run would be a target
   * that moves as you approach it.
   */
  readonly bestDistanceMeters?: number;
  /**
   * Fixes the run's prompt sequence. Omitted in play, where every run gets a
   * fresh seed — otherwise the second attempt at a map is word-for-word the
   * first. Tests and bug reports pass one to get a run back.
   */
  readonly seed?: string;
  /** The app's audio. Absent means a silent run, which is always acceptable. */
  readonly audio?: GameAudio;
  /** Stills the decoration and the camera effects (spec §12). */
  readonly reducedMotion?: boolean;
  /**
   * The run ended. The shell decides what happens next — this screen reports the
   * outcome and stops there, so navigation stays with the state machine.
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
  bestDistanceMeters = 0,
  seed,
  audio,
  reducedMotion = false,
  onRunEnded,
  onQuit,
  onRestart,
  onPauseChange,
}: GameScreenProps = {}): JSX.Element {
  const bridgeRef = useRef<GameBridge | null>(null);
  // Held in refs so the mount effect does not re-run — and tear the runtime
  // down — every time the parent hands over a fresh callback or audio object.
  const endedRef = useRef(onRunEnded);
  endedRef.current = onRunEnded;
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const pauseChangeRef = useRef(onPauseChange);
  pauseChangeRef.current = onPauseChange;
  /** Whether the shell has been told the run is paused. */
  const pausedRef = useRef(false);

  const [game, setGame] = useState<AttachedGame | null>(null);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [state, setState] = useState<GameState>('uninitialized');
  const [prompt, setPrompt] = useState<PromptViewModel | null>(null);
  const [stats, setStats] = useState<LiveRunStats>(EMPTY_LIVE_STATS);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const map = (mapId === undefined ? undefined : findMap(mapId)) ?? MAP_1;

  const announce = useCallback((moment: RunMoment) => {
    setAnnouncement((previous) => {
      const text = announcementFor(moment);

      return previous.endsWith(NUDGE) ? text : `${text}${NUDGE}`;
    });
  }, []);

  useEffect(() => {
    const chosen = mapId === undefined ? undefined : findMap(mapId);

    const attached = attachGame({
      // A new seed per run. The clock is read here, at the edge, because
      // `game-core` may not read one (CLAUDE.md §3).
      seed: seed ?? `run-${String(Date.now())}`,
      // An unknown id falls back to the default map rather than failing to
      // start: the run matters more than the routing mistake behind it.
      ...(chosen === undefined ? {} : { map: chosen }),
    });

    bridgeRef.current = attached.bridge;
    setGame(attached);

    const unsubscribe = attached.bridge.subscribe((event: GameEvent) => {
      switch (event.type) {
        case 'ready':
          setReady(true);
          break;
        case 'stateChanged':
          setState(event.state);
          // Kept in step with the shell, so the machine's idea of "paused"
          // matches the runtime's — but only on an actual change. A run that
          // starts is not a run that resumed, and telling the shell otherwise
          // makes it reject a transition it was never asked for.
          if (event.state === 'paused' && !pausedRef.current) {
            pausedRef.current = true;
            pauseChangeRef.current?.(true);
          } else if (event.state === 'running' && pausedRef.current) {
            pausedRef.current = false;
            pauseChangeRef.current?.(false);
          }
          break;
        case 'promptChanged':
          setPrompt(event.prompt);
          if (event.prompt !== null) {
            // The word is in the world, where a screen reader cannot follow it.
            // Naming it once when it appears is the substitute (spec §21).
            announce({ kind: 'challenge', word: event.prompt.text });
          }
          break;
        case 'statsUpdated':
          setStats(event.stats);
          break;
        case 'boostStarted':
          audioRef.current?.play('boost');
          break;
        case 'obstacleWarning':
          audioRef.current?.play('obstacleWarning');
          announce({ kind: 'obstacleWarning' });
          break;
        case 'playerHit':
          audioRef.current?.play('collision');
          announce({ kind: 'hit', reason: 'collided' });
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

    attached.bridge.send({ type: 'initialize', canvasId: 'game-canvas' });

    // Everything is torn down together: a leaked runtime would keep simulating
    // and hold the whole run in memory.
    return () => {
      unsubscribe();
      attached.destroy();
      bridgeRef.current = null;
      setGame(null);
    };
    // Changing map tears the runtime down and builds a new one: a run belongs to
    // exactly one map, and swapping it underneath a live simulation would be
    // worse.
  }, [mapId, seed, announce]);

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
    // This is a click, so it is a legitimate moment to start the audio context.
    audioRef.current?.unlock();
    audioRef.current?.setTrack('running');
    send(finished ? { type: 'restart' } : { type: 'startRun' });
    announce({ kind: 'started' });
  }, [finished, send, announce]);

  /**
   * The run begins as soon as the scene can draw it.
   *
   * The player already pressed "Start run" on the briefing; asking a second time
   * on a screen that looks exactly like the game is a click that answers a
   * question nobody asked. The button stays for the cases where the run is
   * genuinely stopped — after a crash, or after finishing — because those are
   * moments the player has to choose to leave.
   *
   * Once per mount, guarded by a ref rather than by `state`: a run that ends
   * returns the machine to a stopped state, and keying off that would restart
   * the run under a player reading their own results.
   *
   * Audio still unlocks, because the briefing click gave the document sticky
   * user activation — `resume()` from here is allowed on the strength of it.
   */
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!ready || autoStarted.current) return;

    autoStarted.current = true;
    start();
  }, [ready, start]);

  /**
   * Restart, from the keyboard, from anywhere on the screen (spec §12).
   *
   * Ctrl or Cmd with Enter rather than a bare letter: every printable key is a
   * keystroke in the game now, so an unmodified shortcut would be a trap.
   */
  const restart = useCallback(() => {
    setResult(null);

    // The runtime is restarted here, always. Leaving it to the shell was a bug
    // the e2e tests caught: the screen said "restarted" while the same run
    // carried on underneath.
    send({ type: 'restart' });
    onRestart?.();

    announce({ kind: 'started' });
  }, [onRestart, send, announce]);

  /**
   * Every keystroke, straight from the window.
   *
   * Per-character audio is driven from the value here rather than from a bridge
   * event: keystrokes happen at typing speed, and pushing one event per
   * character through a bridge that exists to throttle traffic would be working
   * against it.
   */
  const handleValue = useCallback(
    (value: string) => {
      send({ type: 'submitInput', value, timestampMs: Date.now() });

      const target = prompt?.text ?? '';
      if (value.length === 0 || target.length === 0) return;

      const correct = target.slice(0, value.length).toLowerCase() === value.toLowerCase();
      if (!correct) {
        audioRef.current?.play('mistake');

        return;
      }

      audioRef.current?.play(value.length === target.length ? 'promptComplete' : 'keystroke');
    },
    [prompt, send],
  );

  useTypingCapture({
    enabled: running,
    promptId: prompt?.promptId ?? null,
    onValue: handleValue,
    onPause: togglePause,
    onRestart: restart,
  });

  // Escape and Ctrl+Enter still work when the capture is off — paused, finished,
  // or not yet started.
  useEffect(() => {
    if (running) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        restart();

        return;
      }

      if (event.key !== 'Escape') return;
      if (event.target instanceof HTMLInputElement) return;

      togglePause();
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [running, togglePause, restart]);

  // A hidden tab is a paused run (spec §20). Deadlines must not run down while
  // nobody can see them.
  useEffect(() => {
    function onVisibility(): void {
      if (document.visibilityState === 'hidden' && state === 'running') send({ type: 'pause' });
    }

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [state, send]);

  const topSpeed = map.speed.maxMetersPerSecond * map.boost.speedMultiplier;
  const endless = map.distanceMeters <= 0;

  return (
    <section className={styles.screen} aria-label="Typing Runner">
      <div
        className={styles.stage}
        role="img"
        aria-label="The road ahead, the hazards on it, and the runner"
      >
        <Suspense fallback={<div className={styles.loading}>Loading the road…</div>}>
          {game !== null && (
            <GameCanvas
              snapshot={game.snapshot}
              advance={game.advance}
              theme={map.theme}
              bestDistanceMeters={bestDistanceMeters}
              reducedMotion={reducedMotion}
            />
          )}
        </Suspense>
      </div>

      {/*
        Everything below floats over the scene and lets clicks through, except
        the controls themselves.
      */}
      <div className={styles.overlay}>
        <div className={styles.topBar}>
          <Hud
            stats={stats}
            topSpeedMetersPerSecond={topSpeed}
            endless={endless}
            bestDistanceMeters={bestDistanceMeters}
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
                : `Crashed. Score ${String(Math.round(result.score))}.`}
            </p>
          )}
        </div>

        <div className={styles.bottom}>
          <div className={styles.controls}>
            {!running && (
              <Button variant="primary" onClick={start} disabled={!ready}>
                {finished ? 'Run again' : 'Start run'}
              </Button>
            )}
            {/* Stated, not hidden in a tutorial the player saw once (spec §12). */}
            <p className={styles.shortcuts}>
              Just type — no clicking needed · <kbd>Esc</kbd> pause · <kbd>Ctrl</kbd> +{' '}
              <kbd>Enter</kbd> restart
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
        The run's live regions. The first narrates *moments* — a warning, a
        collision, the end — and never keystrokes: a region that updated per
        character would be a screen reader that never stops talking. The second
        holds only the current word — not a live region, so it can be re-read on
        demand without announcing itself again.
      */}
      <VisuallyHidden live="polite">{announcement}</VisuallyHidden>
      <VisuallyHidden>{prompt === null ? '' : `Current word: ${prompt.text}`}</VisuallyHidden>
    </section>
  );
}
