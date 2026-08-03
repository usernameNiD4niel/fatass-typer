import {
  advanceChase,
  breakStreak,
  type ChaseState,
  chaseThreat,
  registerCollision as chaseCollision,
  registerMissedPrompt as chaseMissedPrompt,
  registerPromptCompleted as chasePromptCompleted,
  createChaseState,
  earnsRecovery,
  normalizedDistance,
} from '../../game-core/chase';
import {
  type AssistanceState,
  assistedMap,
  createAssistance,
  registerFailure,
  registerSuccess,
} from '../../game-core/assistance';
import { createPromptSelector, nextPrompt, type PromptSelector } from '../../game-core/content';
import type {
  AdaptiveAssistanceConfig,
  LiveRunStats,
  MapConfig,
  ObstacleDefinition,
  PromptEntry,
} from '../../game-core/models';
import { DEFAULT_ADAPTIVE_ASSISTANCE } from '../../game-core/models';
import {
  type ActiveObstacle,
  advanceObstacles,
  advanceSpawner,
  type AvoidanceMove,
  createSpawner,
  expireObstacle,
  moveForOutcome,
  type ObstacleOutcome,
  placeObstacle,
  type ResolvedObstacle,
  resolveAvoided,
  type SpawnerState,
} from '../../game-core/obstacles';
import { createRngFromString } from '../../game-core/random';
import {
  breakCombo,
  createScoreState,
  type PromptOutcome,
  registerCollision as scoreCollision,
  registerMissedPrompt as scoreMissedPrompt,
  registerPromptCompleted as scorePromptCompleted,
  type ScoreState,
} from '../../game-core/scoring';
import {
  averageWpm,
  createRunStats,
  currentWpm,
  recordTypingDelta,
  runAccuracy,
  type RunStats,
} from '../../game-core/stats';
import { boostDurationMs, expectedTypingMs } from '../../game-core/timing';
import { applyInput, createTypingState, type TypingState } from '../../game-core/typing';

/**
 * One run, as rules (spec §19 milestone 1).
 *
 * Pure and deterministic: no clock, no canvas, no React. Time arrives as
 * deltas, randomness comes from a seed, and every call returns a new session
 * plus the events it produced. That is what lets the whole slice be tested
 * without rendering a frame — and what keeps a Rust reimplementation possible.
 *
 * Two kinds of prompt share one typing field. A **boost prompt** is optional
 * speed and is always available; an **obstacle prompt** is mandatory, takes the
 * field the moment it attaches, and carries a deadline. Completing either is the
 * same keystrokes — only the consequences differ, which is why
 * `promptObstacleId` decides which path a completion takes rather than the two
 * having separate input handling.
 *
 * A run with no obstacle definitions is legitimate and behaves exactly as the
 * vertical slice did.
 */

export type RunPhase = 'ready' | 'running' | 'paused' | 'levelComplete' | 'gameOver';

export interface RunSession {
  readonly map: MapConfig;
  readonly pool: readonly PromptEntry[];
  readonly phase: RunPhase;

  /** Distance covered, in meters. */
  readonly playerMeters: number;
  /** Milliseconds of *simulated* time. A paused run does not advance it. */
  readonly elapsedMs: number;
  /** Milliseconds of boost left, or 0. */
  readonly boostRemainingMs: number;

  readonly prompt: PromptEntry | null;
  readonly typing: TypingState;
  /** When the current prompt was first shown, in run time. */
  readonly promptStartedMs: number;
  /**
   * Which obstacle the current prompt belongs to, or `null` for a boost prompt.
   *
   * An obstacle prompt is mandatory and takes the field the moment it attaches;
   * a boost prompt is optional speed. Tracking the owner is what lets one code
   * path handle completion for both.
   */
  readonly promptObstacleId: string | null;

  readonly selector: PromptSelector;
  readonly chase: ChaseState;
  readonly stats: RunStats;
  readonly score: ScoreState;

  readonly obstaclePool: readonly ObstacleDefinition[];
  readonly spawner: SpawnerState;
  /** Adaptive assistance (spec §6). Moves the reaction buffer, nothing else. */
  readonly assistance: AssistanceState;
  readonly assistanceConfig: AdaptiveAssistanceConfig;
  /** Obstacles currently in the world, nearest last. */
  readonly obstacles: readonly ActiveObstacle[];

  readonly completedPrompts: number;
  readonly obstaclesFaced: number;
  readonly obstaclesAvoided: number;
  readonly stumbles: number;
  readonly collisions: number;
}

export type SessionEvent =
  | { readonly type: 'promptChanged'; readonly prompt: PromptEntry | null }
  | { readonly type: 'promptCompleted'; readonly prompt: PromptEntry; readonly points: number }
  | { readonly type: 'boostStarted' }
  | { readonly type: 'boostEnded' }
  | { readonly type: 'obstacleSpawned'; readonly obstacle: ActiveObstacle }
  | { readonly type: 'obstacleWarning'; readonly obstacle: ActiveObstacle }
  | { readonly type: 'obstacleAttached'; readonly obstacle: ActiveObstacle }
  | {
      readonly type: 'obstacleResolved';
      readonly obstacle: ActiveObstacle;
      readonly outcome: ObstacleOutcome;
      /** What the MC should be seen doing. The runtime maps it to a pose. */
      readonly move: AvoidanceMove;
      readonly points: number;
    }
  | { readonly type: 'phaseChanged'; readonly phase: RunPhase };

export interface RunSessionResult {
  readonly session: RunSession;
  readonly events: readonly SessionEvent[];
}

/**
 * Longest first prompt of a run, in characters.
 *
 * The gap only opens while boosting, and a boost is only earned by finishing a
 * prompt. Opening on a long phrase therefore means watching the dogs close the
 * entire starting gap while typing it — a run lost before the player did
 * anything wrong. Every prompt after the first is cushioned by the boost the
 * one before it earned.
 */
export const WARM_UP_PROMPT_CHARACTERS = 10;

/**
 * Sizes the running boost to the prompt now on screen.
 *
 * Applied after a prompt is drawn, so the reward for the last one is what
 * carries the player through the next one. Never shortens a boost already
 * running — a reward is not taken back.
 */
function withBoostForCurrentPrompt(session: RunSession): RunSession {
  const characters = session.prompt?.normalizedText.length ?? 0;
  const earned = boostDurationMs(session.map.boost, characters);

  return { ...session, boostRemainingMs: Math.max(session.boostRemainingMs, earned) };
}

/** Draws the next boost prompt and resets the typing state onto it. */
function withNextPrompt(session: RunSession): RunSessionResult {
  const { prompt, selector } = nextPrompt(session.selector, session.pool, {
    mapNumber: session.map.mapNumber,
    categories: session.map.content.promptCategories,
    usage: 'boost',
    preferredTags: session.map.content.themeTags,
    ...(session.completedPrompts === 0 ? { maxCharacters: WARM_UP_PROMPT_CHARACTERS } : {}),
  });

  return {
    session: {
      ...session,
      selector,
      prompt,
      typing: createTypingState(prompt?.text ?? ''),
      promptStartedMs: session.elapsedMs,
      promptObstacleId: null,
    },
    events: [{ type: 'promptChanged', prompt }],
  };
}

export interface CreateRunSessionInput {
  readonly map: MapConfig;
  readonly pool: readonly PromptEntry[];
  /** Obstacle definitions the map may draw from. Empty means a run with none. */
  readonly obstacles?: readonly ObstacleDefinition[];
  /** Adaptive assistance. Pass `{ ...config, enabled: false }` to turn it off. */
  readonly assistance?: AdaptiveAssistanceConfig;
  /** Same seed, same run — the property the whole test suite leans on. */
  readonly seed: string;
}

export function createRunSession(input: CreateRunSessionInput): RunSession {
  // Two generators from one seed. Sharing one would couple prompt selection to
  // obstacle spacing: changing a word list would silently reshuffle the map.
  const base: RunSession = {
    map: input.map,
    pool: input.pool,
    phase: 'ready',
    playerMeters: 0,
    elapsedMs: 0,
    boostRemainingMs: 0,
    prompt: null,
    typing: createTypingState(''),
    promptStartedMs: 0,
    promptObstacleId: null,
    selector: createPromptSelector(createRngFromString(`${input.seed}:prompts`)),
    chase: createChaseState(input.map.chase),
    stats: createRunStats(),
    score: createScoreState(),
    obstaclePool: input.obstacles ?? [],
    spawner: createSpawner(createRngFromString(`${input.seed}:obstacles`), input.map.content),
    assistance: createAssistance(),
    assistanceConfig: input.assistance ?? DEFAULT_ADAPTIVE_ASSISTANCE,
    obstacles: [],
    completedPrompts: 0,
    obstaclesFaced: 0,
    obstaclesAvoided: 0,
    stumbles: 0,
    collisions: 0,
  };

  return withNextPrompt(base).session;
}

/** The MC's speed right now, in meters per second. */
export function currentSpeed(session: RunSession): number {
  const base = session.map.baseSpeedMetersPerSecond;

  return session.boostRemainingMs > 0 ? base * session.map.boost.speedMultiplier : base;
}

export function isBoosting(session: RunSession): boolean {
  return session.boostRemainingMs > 0;
}

/** Progress to the finish line, 0..1. */
export function runProgress(session: RunSession): number {
  if (session.map.distanceMeters <= 0) return 1;

  return Math.min(1, session.playerMeters / session.map.distanceMeters);
}

function toPhase(session: RunSession, phase: RunPhase): RunSessionResult {
  if (session.phase === phase) return { session, events: [] };

  return { session: { ...session, phase }, events: [{ type: 'phaseChanged', phase }] };
}

export function startRun(session: RunSession): RunSessionResult {
  return session.phase === 'ready' ? toPhase(session, 'running') : { session, events: [] };
}

export function pauseRun(session: RunSession): RunSessionResult {
  return session.phase === 'running' ? toPhase(session, 'paused') : { session, events: [] };
}

export function resumeRun(session: RunSession): RunSessionResult {
  return session.phase === 'paused' ? toPhase(session, 'running') : { session, events: [] };
}

/* -------------------------------------------------------------------------- */
/* Obstacles                                                                  */
/* -------------------------------------------------------------------------- */

/** Spawns whatever the schedule says is due and places it in the world. */
function spawnDueObstacles(session: RunSession): RunSessionResult {
  if (session.obstaclePool.length === 0) return { session, events: [] };

  const due = advanceSpawner(session.spawner, session.elapsedMs, {
    content: session.map.content,
    mapNumber: session.map.mapNumber,
    pool: session.obstaclePool,
  });

  if (due.spawned.length === 0) return { session: { ...session, spawner: due.state }, events: [] };

  const events: SessionEvent[] = [];
  let selector = session.selector;
  const placed: ActiveObstacle[] = [];
  let index = session.obstaclesFaced;

  for (const definition of due.spawned) {
    const drawn = nextPrompt(selector, session.pool, {
      mapNumber: session.map.mapNumber,
      categories: [definition.promptCategory],
      usage: 'obstacle',
      preferredTags: session.map.content.themeTags,
    });
    selector = drawn.selector;

    // No prompt in the pool fits this obstacle's category. Skipping it is the
    // honest failure: spawning something untypeable would be a free collision.
    if (drawn.prompt === null) continue;

    index += 1;
    const obstacle = placeObstacle({
      instanceId: `obstacle-${String(index)}`,
      definition,
      prompt: drawn.prompt,
      // Assistance enters here and only here: the obstacle is placed against a
      // map whose reaction buffer has been nudged, so the extra time is real
      // distance on the road rather than a special case in the deadline.
      map: assistedMap(session.map, session.assistance),
      playerMeters: session.playerMeters,
      elapsedMs: session.elapsedMs,
    });

    placed.push(obstacle);
    events.push({ type: 'obstacleSpawned', obstacle });
  }

  return {
    session: {
      ...session,
      spawner: due.state,
      selector,
      obstacles: [...session.obstacles, ...placed],
      obstaclesFaced: index,
    },
    events,
  };
}

/** Hands the typing field to an obstacle. Its prompt is mandatory. */
function attachObstaclePrompt(session: RunSession, obstacle: ActiveObstacle): RunSessionResult {
  return {
    session: {
      ...session,
      prompt: obstacle.prompt,
      typing: createTypingState(obstacle.prompt.text),
      promptStartedMs: session.elapsedMs,
      promptObstacleId: obstacle.instanceId,
    },
    events: [
      { type: 'obstacleAttached', obstacle },
      { type: 'promptChanged', prompt: obstacle.prompt },
    ],
  };
}

/**
 * Applies what an ending costs or earns (spec §5, §8).
 *
 * The one place obstacle outcomes touch the chase, the score, and the run
 * statistics — so a new outcome cannot be added and silently forgotten by one
 * of the three.
 */
function applyResolution(session: RunSession, resolved: ResolvedObstacle): RunSessionResult {
  const { outcome, obstacle } = resolved;
  const profile = session.map.chase;

  const replaced = session.obstacles.map((entry) =>
    entry.instanceId === obstacle.instanceId ? obstacle : entry,
  );

  let next: RunSession = { ...session, obstacles: replaced };
  let points = 0;

  if (outcome === 'avoided') {
    const scored = scorePromptCompleted(next.score, {
      correctCharacters: next.typing.correctCharacters,
      incorrectCharacters: next.typing.incorrectCharacters,
      isObstacle: true,
      expectedTypingMs: obstacle.timing.expectedTypingMs,
      actualTypingMs: next.elapsedMs - next.promptStartedMs,
      // Finishing early is worth something: it is the difference between
      // clearing an obstacle and scraping past it.
      remainingMs: resolved.remainingMs,
    });

    points = scored.score - next.score.score;
    next = {
      ...next,
      score: scored,
      chase: earnsRecovery(next.typing.correctCharacters, next.typing.incorrectCharacters)
        ? chasePromptCompleted(next.chase, profile)
        : next.chase,
      obstaclesAvoided: next.obstaclesAvoided + 1,
      completedPrompts: next.completedPrompts + 1,
      // Clearing an obstacle grants the same boost a typed word does — the
      // reward for good typing should not depend on which prompt it was.
      boostRemainingMs: boostDurationMs(next.map.boost, obstacle.prompt.normalizedText.length),

      assistance: registerSuccess(next.assistance, next.assistanceConfig),
    };
  } else if (outcome === 'stumbled') {
    // Cheaper than a collision, and it still breaks the combo.
    next = {
      ...next,
      chase: chaseMissedPrompt(next.chase, profile),
      score: scoreMissedPrompt(next.score),
      stumbles: next.stumbles + 1,
      // A stumble counts as a failure for assistance: the player ran out of
      // road, which is exactly the thing more reaction time would have fixed.
      assistance: registerFailure(next.assistance, next.assistanceConfig),
    };
    points = next.score.score - session.score.score;
  } else {
    next = {
      ...next,
      chase: chaseCollision(next.chase, profile),
      score: scoreCollision(next.score),
      collisions: next.collisions + 1,
      assistance: registerFailure(next.assistance, next.assistanceConfig),
    };
    points = next.score.score - session.score.score;
  }

  const resolvedEvent: SessionEvent = {
    type: 'obstacleResolved',
    obstacle,
    outcome,
    move: moveForOutcome(outcome, obstacle.definition.action),
    points,
  };

  // The field goes back to boost prompts, whatever the ending was.
  const restored = withNextPrompt(next);

  return { session: restored.session, events: [resolvedEvent, ...restored.events] };
}

/** Removes an obstacle that has finished with the world. */
function forget(session: RunSession, instanceId: string): RunSession {
  return {
    ...session,
    obstacles: session.obstacles.filter((entry) => entry.instanceId !== instanceId),
  };
}

/** Runs every live obstacle's clock and reacts to what it reports. */
function advanceObstacleLifecycle(session: RunSession): RunSessionResult {
  if (session.obstacles.length === 0) return { session, events: [] };

  const advanced = advanceObstacles(session.obstacles, {
    playerMeters: session.playerMeters,
    speedMetersPerSecond: currentSpeed(session),
    elapsedMs: session.elapsedMs,
  });

  let current: RunSession = { ...session, obstacles: advanced.obstacles };
  const events: SessionEvent[] = [];

  for (const event of advanced.events) {
    if (event.type === 'obstacleWarning') {
      events.push({ type: 'obstacleWarning', obstacle: event.obstacle });
      continue;
    }

    if (event.type === 'promptAttached') {
      const attached = attachObstaclePrompt(current, event.obstacle);
      current = attached.session;
      events.push(...attached.events);
      continue;
    }

    // The deadline passed. `expireObstacle` decides stumble or hit, and its
    // guard is what stops a second charge if this fires again.
    const expiring = current.obstacles.find(
      (entry) => entry.instanceId === event.obstacle.instanceId,
    );
    if (expiring === undefined) continue;

    const expired = expireObstacle(expiring, current.typing, current.elapsedMs);
    if (expired.resolved === null) continue;

    const applied = applyResolution(current, expired.resolved);
    current = forget(applied.session, event.obstacle.instanceId);
    events.push(...applied.events);
  }

  return { session: current, events };
}

/**
 * Advances the simulation by one fixed step.
 *
 * Only `running` advances. A paused or finished run is frozen, so the elapsed
 * clock that every statistic derives from cannot drift while nobody is playing.
 */
export function advanceRunSession(session: RunSession, deltaMs: number): RunSessionResult {
  if (session.phase !== 'running' || deltaMs <= 0) return { session, events: [] };

  const events: SessionEvent[] = [];
  const seconds = deltaMs / 1000;
  const speed = currentSpeed(session);

  const boostRemainingMs = Math.max(0, session.boostRemainingMs - deltaMs);
  if (session.boostRemainingMs > 0 && boostRemainingMs === 0) events.push({ type: 'boostEnded' });

  const advanced: RunSession = {
    ...session,
    elapsedMs: session.elapsedMs + deltaMs,
    playerMeters: session.playerMeters + speed * seconds,
    boostRemainingMs,
    chase: advanceChase(session.chase, session.map.chase, deltaMs, {
      playerSpeedMetersPerSecond: speed,
      baseSpeedMetersPerSecond: session.map.baseSpeedMetersPerSecond,
    }),
  };

  // Obstacles run after movement, so their time-to-impact is measured against
  // where the MC actually is this step rather than where they were last step.
  const spawned = spawnDueObstacles(advanced);
  const lifecycle = advanceObstacleLifecycle(spawned.session);

  const withObstacles = lifecycle.session;
  const allEvents = [...events, ...spawned.events, ...lifecycle.events];

  // Finishing wins ties. Crossing the line and being caught on the same step is
  // vanishingly rare, but the player who reached the finish earned it.
  if (withObstacles.playerMeters >= withObstacles.map.distanceMeters) {
    const finished = toPhase(
      { ...withObstacles, playerMeters: withObstacles.map.distanceMeters },
      'levelComplete',
    );

    return { session: finished.session, events: [...allEvents, ...finished.events] };
  }

  // A collision can be what closes the gap, so this is checked after the
  // obstacle lifecycle rather than before it.
  if (withObstacles.chase.caught) {
    const over = toPhase(withObstacles, 'gameOver');

    return { session: over.session, events: [...allEvents, ...over.events] };
  }

  return { session: withObstacles, events: allEvents };
}

/**
 * Applies the typing field's current value.
 *
 * The whole value, not a keystroke — insertions, backspace, and paste all go
 * through the same diff (CLAUDE.md §3).
 */
export function applyRunInput(session: RunSession, value: string): RunSessionResult {
  if (session.phase !== 'running' || session.prompt === null) return { session, events: [] };

  const typing = applyInput(session.typing, value);
  if (typing === session.typing) return { session, events: [] };

  const stats = recordTypingDelta(session.stats, session.typing, typing, session.elapsedMs);

  const typed: RunSession = { ...session, typing, stats };

  if (!typing.complete) {
    // A mistake breaks both streaks the moment it happens, so recovery and the
    // combo have to be re-earned rather than surviving a sloppy prompt.
    const mistyped = typing.incorrectCharacters > session.typing.incorrectCharacters;

    return {
      session: mistyped
        ? { ...typed, chase: breakStreak(typed.chase), score: breakCombo(typed.score) }
        : typed,
      events: [],
    };
  }

  // An obstacle prompt and a boost prompt are typed identically; only what
  // completing them means differs.
  return typed.promptObstacleId === null
    ? completePrompt(typed)
    : completeObstaclePrompt(typed, typed.promptObstacleId);
}

/** The prompt attached to an obstacle was finished in time. */
function completeObstaclePrompt(session: RunSession, instanceId: string): RunSessionResult {
  const obstacle = session.obstacles.find((entry) => entry.instanceId === instanceId);

  // The obstacle is gone — expired on the same step, or already resolved. The
  // guard in `resolveAvoided` covers the rest; this covers the lookup.
  if (obstacle === undefined) return withNextPrompt(session);

  const result = resolveAvoided(obstacle, session.typing, session.elapsedMs);
  if (result.resolved === null) return withNextPrompt(session);

  const applied = applyResolution(session, result.resolved);

  return { session: forget(applied.session, instanceId), events: applied.events };
}

/** Everything that happens when a boost prompt is finished. */
function completePrompt(session: RunSession): RunSessionResult {
  const prompt = session.prompt;
  if (prompt === null) return { session, events: [] };

  const outcome: PromptOutcome = {
    correctCharacters: session.typing.correctCharacters,
    incorrectCharacters: session.typing.incorrectCharacters,
    isObstacle: false,
    expectedTypingMs: expectedTypingMs(prompt.normalizedText.length, session.map.targetWpm),
    actualTypingMs: session.elapsedMs - session.promptStartedMs,
    // Boost prompts carry no deadline (spec §5), so there is no time bonus.
    remainingMs: 0,
  };

  const score = scorePromptCompleted(session.score, outcome);
  const points = score.score - session.score.score;
  const accurate = earnsRecovery(
    session.typing.correctCharacters,
    session.typing.incorrectCharacters,
  );

  const rewarded: RunSession = {
    ...session,
    score,
    // Only accurate typing buys ground back — otherwise the dogs would be a
    // formality for anyone typing quickly but badly.
    chase: accurate ? chasePromptCompleted(session.chase, session.map.chase) : session.chase,
    completedPrompts: session.completedPrompts + 1,
  };

  const next = withNextPrompt(rewarded);

  return {
    session: withBoostForCurrentPrompt(next.session),
    events: [{ type: 'promptCompleted', prompt, points }, { type: 'boostStarted' }, ...next.events],
  };
}

/** The snapshot the HUD renders, built on demand rather than tracked. */
export function liveStats(session: RunSession): LiveRunStats {
  return {
    currentWpm: currentWpm(session.stats, session.elapsedMs),
    averageWpm: averageWpm(session.stats, session.elapsedMs),
    accuracy: runAccuracy(session.stats),
    combo: session.score.combo,
    score: session.score.score,
    progress: runProgress(session),
    dogDistanceNormalized: normalizedDistance(session.chase, session.map.chase),
    elapsedMs: session.elapsedMs,
  };
}

/** The obstacle currently holding the typing field, if any. */
export function activeObstacle(session: RunSession): ActiveObstacle | null {
  if (session.promptObstacleId === null) return null;

  return session.obstacles.find((entry) => entry.instanceId === session.promptObstacleId) ?? null;
}

/** Obstacles cleared as a fraction of obstacles faced. 1 when none were faced. */
export function obstacleSuccessRate(session: RunSession): number {
  const resolvedCount = session.obstaclesAvoided + session.stumbles + session.collisions;
  if (resolvedCount === 0) return 1;

  return session.obstaclesAvoided / resolvedCount;
}

export function sessionThreat(session: RunSession): ReturnType<typeof chaseThreat> {
  return chaseThreat(session.chase, session.map.chase);
}
