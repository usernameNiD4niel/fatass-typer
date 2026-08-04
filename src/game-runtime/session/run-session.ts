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
  LaneIndex,
  LiveRunStats,
  MapConfig,
  ObstacleDefinition,
  PromptEntry,
} from '../../game-core/models';
import { CENTRE_LANE, DEFAULT_ADAPTIVE_ASSISTANCE } from '../../game-core/models';
import {
  advanceMotion,
  beginJump,
  beginLaneChange,
  createPlayerMotion,
  isSettled,
  lanePosition,
  type PlayerMotion,
  rampedSpeed,
  targetLane,
} from '../../game-core/motion';
import {
  type ActiveCoin,
  advanceCoin,
  commitCoin,
  distanceToCoins,
  isCoinLive,
  placeCoin,
  resolveCoin,
} from '../../game-core/pickups';
import {
  type ActiveObstacle,
  advanceObstacles,
  advanceSpawner,
  assignLanes,
  type AvoidanceMove,
  beginRecovery,
  commitObstacle,
  createSpawner,
  expireObstacle,
  type FailureReason,
  moveForOutcome,
  moveIsDue,
  type ObstacleOutcome,
  placeObstacle,
  resolveAtImpact,
  type ResolvedObstacle,
  startMove,
  type SpawnerState,
} from '../../game-core/obstacles';
import { createRngFromString, type Rng } from '../../game-core/random';
import {
  awardCoins,
  breakCombo,
  createScoreState,
  registerCollision as scoreCollision,
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
import { boostDurationMs } from '../../game-core/timing';
import { applyInput, createTypingState, type TypingState } from '../../game-core/typing';

/**
 * One run, as rules.
 *
 * Pure and deterministic: no clock, no canvas, no React. Time arrives as
 * deltas, randomness comes from a seed, and every call returns a new session
 * plus the events it produced. That is what lets the whole game be tested
 * without rendering a frame.
 *
 * ## The loop
 *
 * The player runs forward down a three-lane road. One hazard at a time comes at
 * them. A **car** blocks their lane and a word appears on the open side;
 * completing it starts an eased lane change. A **jump hazard** blocks the lane
 * and the word sits above it; completing it starts a jump. Then the road is
 * quiet for a moment, and the next hazard is scheduled.
 *
 * Typing the word does not survive the hazard — it *commits* the player to the
 * move. Survival is decided at the collision plane, by where their body
 * actually is. In practice a committed player always makes it, because
 * `motionReserveMs` placed the hazard far enough away; the check at the plane is
 * what turns that from an assumption into something a failing test can catch.
 *
 * ## What ends a run
 *
 * The finish line, or a hazard. There is no chase and no health: a hit is the
 * end, after a brief readable beat. Typing itself stays forgiving — a wrong
 * character costs the combo, never the run — because accuracy is a statistic
 * the progression gates on, and a game that ends on one slip cannot measure it.
 */

/** Which encounter owns the word currently on screen. */
export interface ChallengeRef {
  readonly kind: 'hazard' | 'coin';
  readonly id: string;
}

export type RunPhase =
  | 'ready'
  | 'running'
  /** Hit. Held for a beat so the player can see what happened (spec §6). */
  | 'impact'
  | 'paused'
  | 'levelComplete'
  | 'gameOver';

/**
 * How long the impact is held before the run ends.
 *
 * Long enough to read as a collision rather than a freeze; short enough that it
 * never feels like being made to wait for a result you already know.
 */
export const IMPACT_BEAT_MS = 650;

/**
 * What a coin word is drawn from.
 *
 * Deliberately not the map's own categories. A coin line sits between two
 * hazards, and a detour that takes longer than the hazards around it stops
 * being a detour.
 */
const COIN_CATEGORIES = ['short-word'] as const;

/** How far behind the player a spent coin line is forgotten, in metres. */
const COIN_DESPAWN_METERS = 20;

export interface RunSession {
  readonly map: MapConfig;
  readonly pool: readonly PromptEntry[];
  readonly phase: RunPhase;

  /** Distance covered, in meters. */
  readonly playerMeters: number;
  /** Milliseconds of *simulated* time. A paused run does not advance it. */
  readonly elapsedMs: number;
  /** Milliseconds of boost left, or 0. Earned by clearing a hazard. */
  readonly boostRemainingMs: number;
  /** Time left on the impact beat before the run ends. */
  readonly impactRemainingMs: number;
  /** Why the run ended, or `null` while it has not. */
  readonly failureReason: FailureReason | null;

  /** Where the player is across the road, and how far off the ground. */
  readonly motion: PlayerMotion;

  /** The word currently being typed, or `null` between hazards. */
  readonly prompt: PromptEntry | null;
  readonly typing: TypingState;
  /** When the current prompt was first shown, in run time. */
  readonly promptStartedMs: number;
  /**
   * What the current word belongs to, or `null` when there is nothing to type.
   *
   * One slot, two kinds. A hazard word is mandatory and a coin word is optional,
   * but they are typed identically and only one is ever on screen — a second
   * word would be a second thing to read at the moment the player can least
   * afford it.
   */
  readonly challenge: ChallengeRef | null;
  /**
   * Milliseconds spent with a challenge on screen.
   *
   * The denominator for WPM. Wall-clock run time would divide the player's
   * typing by the long quiet stretches between hazards and report a third of
   * their real speed — which the unlock gates and the lifetime peak both assume
   * is a typing speed, not a duty cycle.
   */
  readonly activeTypingMs: number;

  readonly selector: PromptSelector;
  readonly stats: RunStats;
  readonly score: ScoreState;

  readonly obstaclePool: readonly ObstacleDefinition[];
  readonly spawner: SpawnerState;
  /** Feeds `assignLanes`. Kept apart from the spawner's own draw sequence. */
  readonly laneRng: Rng;
  /** Adaptive assistance (spec §6). Moves the reaction buffer, nothing else. */
  readonly assistance: AssistanceState;
  readonly assistanceConfig: AdaptiveAssistanceConfig;
  /** Hazards currently in the world. At most one unresolved, by construction. */
  readonly obstacles: readonly ActiveObstacle[];
  /** Coin lines currently in the world. At most one unresolved. */
  readonly coins: readonly ActiveCoin[];
  /** Run time the next coin line may appear. */
  readonly nextCoinAtMs: number;
  readonly coinRng: Rng;

  readonly completedPrompts: number;
  readonly obstaclesFaced: number;
  readonly obstaclesAvoided: number;
  readonly collisions: number;
  readonly coinsCollected: number;
  readonly coinsMissed: number;
}

export type SessionEvent =
  | { readonly type: 'promptChanged'; readonly prompt: PromptEntry | null }
  | { readonly type: 'promptCompleted'; readonly prompt: PromptEntry; readonly points: number }
  | { readonly type: 'boostStarted' }
  | { readonly type: 'boostEnded' }
  | { readonly type: 'obstacleSpawned'; readonly obstacle: ActiveObstacle }
  | { readonly type: 'obstacleWarning'; readonly obstacle: ActiveObstacle }
  | { readonly type: 'obstacleAttached'; readonly obstacle: ActiveObstacle }
  /** The word was finished and the avoidance move has begun. */
  | {
      readonly type: 'obstacleCommitted';
      readonly obstacle: ActiveObstacle;
      readonly move: AvoidanceMove;
      readonly points: number;
    }
  | {
      readonly type: 'obstacleResolved';
      readonly obstacle: ActiveObstacle;
      readonly outcome: ObstacleOutcome;
      readonly move: AvoidanceMove;
      readonly failureReason: FailureReason | null;
    }
  | { readonly type: 'coinSpawned'; readonly coin: ActiveCoin }
  | { readonly type: 'coinAttached'; readonly coin: ActiveCoin }
  | {
      readonly type: 'coinResolved';
      readonly coin: ActiveCoin;
      readonly collected: boolean;
      readonly value: number;
    }
  | { readonly type: 'phaseChanged'; readonly phase: RunPhase };

export interface RunSessionResult {
  readonly session: RunSession;
  readonly events: readonly SessionEvent[];
}

export interface CreateRunSessionInput {
  readonly map: MapConfig;
  readonly pool: readonly PromptEntry[];
  /** Hazard definitions the map may draw from. Empty means a run with none. */
  readonly obstacles?: readonly ObstacleDefinition[];
  /** Adaptive assistance. Pass `{ ...config, enabled: false }` to turn it off. */
  readonly assistance?: AdaptiveAssistanceConfig;
  /** Same seed, same run — the property the whole test suite leans on. */
  readonly seed: string;
}

export function createRunSession(input: CreateRunSessionInput): RunSession {
  // Separate generators from one seed. Sharing one would couple prompt
  // selection to hazard spacing: changing a word list would silently reshuffle
  // the map.
  return {
    map: input.map,
    pool: input.pool,
    phase: 'ready',
    playerMeters: 0,
    elapsedMs: 0,
    boostRemainingMs: 0,
    impactRemainingMs: 0,
    failureReason: null,
    motion: createPlayerMotion(CENTRE_LANE),
    prompt: null,
    typing: createTypingState(''),
    promptStartedMs: 0,
    challenge: null,
    activeTypingMs: 0,
    selector: createPromptSelector(createRngFromString(`${input.seed}:prompts`)),
    stats: createRunStats(),
    score: createScoreState(),
    obstaclePool: input.obstacles ?? [],
    spawner: createSpawner(createRngFromString(`${input.seed}:obstacles`), input.map.content),
    laneRng: createRngFromString(`${input.seed}:lanes`),
    coinRng: createRngFromString(`${input.seed}:coins`),
    coins: [],
    nextCoinAtMs: input.map.content.coinIntervalSeconds * 1_000,
    assistance: createAssistance(),
    assistanceConfig: input.assistance ?? DEFAULT_ADAPTIVE_ASSISTANCE,
    obstacles: [],
    completedPrompts: 0,
    obstaclesFaced: 0,
    obstaclesAvoided: 0,
    collisions: 0,
    coinsCollected: 0,
    coinsMissed: 0,
  };
}

/**
 * The player's speed right now, in meters per second.
 *
 * Base speed, ramped with run time (spec §9), multiplied while boosting.
 */
export function currentSpeed(session: RunSession): number {
  const ramped = rampedSpeed(
    session.map.baseSpeedMetersPerSecond,
    session.map.speed,
    session.elapsedMs,
  );

  return session.boostRemainingMs > 0 ? ramped * session.map.boost.speedMultiplier : ramped;
}

/**
 * The speed a hazard's placement is measured against.
 *
 * The fastest the player could possibly be travelling while it approaches —
 * ramped speed *and* a boost. Placing against anything slower would let a boost
 * eat the budget the player was promised: they would arrive early at a hazard
 * whose deadline assumed they would not.
 *
 * Erring high means an unboosted player gets slightly more road than the label
 * implies. The map promises a floor, not a ceiling, so that is the safe
 * direction to be wrong in.
 */
function placementSpeed(session: RunSession): number {
  return (
    rampedSpeed(session.map.baseSpeedMetersPerSecond, session.map.speed, session.elapsedMs) *
    session.map.boost.speedMultiplier
  );
}

export function isBoosting(session: RunSession): boolean {
  return session.boostRemainingMs > 0;
}

/** Progress to the finish line, 0..1. */
export function runProgress(session: RunSession): number {
  if (session.map.distanceMeters <= 0) return 1;

  return Math.min(1, session.playerMeters / session.map.distanceMeters);
}

/** Which lane the player is committed to. Unchanged mid-transition. */
export function playerLane(session: RunSession): LaneIndex {
  return session.motion.lane;
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
/* Hazards                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * True while a hazard is unresolved. Gates the spawner.
 *
 * `committed` counts. Letting the next hazard approach during the travel after
 * a commitment looks like free density, and it was tried: it ends every run,
 * because the second word can attach while the first move is still in flight
 * and committing to it preempts a move the player had already earned.
 *
 * Density has to come from making an encounter shorter, not from overlapping
 * two of them.
 */
function hasLiveHazard(session: RunSession): boolean {
  return session.obstacles.some(
    (entry) =>
      entry.status === 'approaching' || entry.status === 'active' || entry.status === 'committed',
  );
}

/** Spawns whatever the schedule says is due and places it in the world. */
function spawnDueObstacle(session: RunSession): RunSessionResult {
  if (session.obstaclePool.length === 0) return { session, events: [] };

  const due = advanceSpawner(session.spawner, session.elapsedMs, {
    content: session.map.content,
    mapNumber: session.map.mapNumber,
    pool: session.obstaclePool,
    hazardsLive: hasLiveHazard(session),
    coinsLive: session.coins.some(isCoinLive),
  });

  const definition = due.spawned;
  if (definition === null) return { session: { ...session, spawner: due.state }, events: [] };

  const drawn = nextPrompt(session.selector, session.pool, {
    mapNumber: session.map.mapNumber,
    categories: [definition.promptCategory],
    usage: 'obstacle',
    preferredTags: session.map.content.themeTags,
  });

  // No prompt in the pool fits this hazard's category. Skipping it is the
  // honest failure: spawning something untypeable would be a free collision.
  if (drawn.prompt === null) {
    return { session: { ...session, spawner: due.state, selector: drawn.selector }, events: [] };
  }

  const assigned = assignLanes(session.laneRng, {
    action: definition.action,
    // The lane they will be in, not the one they are leaving: a coin swerve may
    // be in flight, and a car assigned around a lane nobody ends up in is a car
    // assigned around nothing.
    playerLane: targetLane(session.motion),
    doubleBlockChance: session.map.content.doubleBlockChance,
  });

  const index = session.obstaclesFaced + 1;
  const obstacle = placeObstacle({
    instanceId: `obstacle-${String(index)}`,
    definition,
    prompt: drawn.prompt,
    // Assistance enters here and only here: the hazard is placed against a map
    // whose reaction buffer has been nudged, so the extra time is real distance
    // on the road rather than a special case in the deadline.
    map: assistedMap(session.map, session.assistance),
    playerMeters: session.playerMeters,
    elapsedMs: session.elapsedMs,
    assignment: assigned.assignment,
    speedMetersPerSecond: placementSpeed(session),
  });

  return {
    session: {
      ...session,
      spawner: due.state,
      selector: drawn.selector,
      laneRng: assigned.rng,
      obstacles: [...session.obstacles, obstacle],
      obstaclesFaced: index,
    },
    events: [{ type: 'obstacleSpawned', obstacle }],
  };
}

/**
 * Hands the typing field to a hazard. Its word is mandatory.
 *
 * A coin word on screen is abandoned here, and deliberately: the player has one
 * word to read and it had better be the one that can end their run.
 */
function attachObstaclePrompt(session: RunSession, obstacle: ActiveObstacle): RunSessionResult {
  const abandoned = abandonUncommittedCoins(session);

  return {
    session: {
      ...abandoned,
      prompt: obstacle.prompt,
      typing: createTypingState(obstacle.prompt.text),
      promptStartedMs: session.elapsedMs,
      challenge: { kind: 'hazard', id: obstacle.instanceId },
    },
    events: [
      { type: 'obstacleAttached', obstacle },
      { type: 'promptChanged', prompt: obstacle.prompt },
    ],
  };
}

/** Hands the typing field to a coin line. Its word is optional. */
function attachCoinPrompt(session: RunSession, coin: ActiveCoin): RunSessionResult {
  // A hazard already owns the field. Coins never interrupt one.
  if (session.challenge?.kind === 'hazard') return { session, events: [] };

  return {
    session: {
      ...session,
      prompt: coin.prompt,
      typing: createTypingState(coin.prompt.text),
      promptStartedMs: session.elapsedMs,
      challenge: { kind: 'coin', id: coin.instanceId },
    },
    events: [
      { type: 'coinAttached', coin },
      { type: 'promptChanged', prompt: coin.prompt },
    ],
  };
}

/** Gives up on any coin line the player has not already committed to. */
function abandonUncommittedCoins(session: RunSession): RunSession {
  if (!session.coins.some((coin) => coin.status === 'approaching' || coin.status === 'active')) {
    return session;
  }

  return {
    ...session,
    coins: session.coins.map((coin) =>
      coin.status === 'approaching' || coin.status === 'active'
        ? { ...coin, status: 'missed' as const }
        : coin,
    ),
  };
}

/** Clears the typing field. Nothing to type until the next hazard arrives. */
function clearPrompt(session: RunSession): RunSessionResult {
  if (session.prompt === null && session.challenge === null) return { session, events: [] };

  return {
    session: { ...session, prompt: null, typing: createTypingState(''), challenge: null },
    events: [{ type: 'promptChanged', prompt: null }],
  };
}

/** Removes a hazard that has finished with the world. */
function forget(session: RunSession, instanceId: string): RunSession {
  return {
    ...session,
    obstacles: session.obstacles.filter((entry) => entry.instanceId !== instanceId),
  };
}

/**
 * Applies what an ending costs or earns (spec §8).
 *
 * The one place hazard outcomes touch the score, the statistics, and the run's
 * fate — so a new outcome cannot be added and silently forgotten by one of
 * them.
 */
function applyResolution(session: RunSession, resolved: ResolvedObstacle): RunSessionResult {
  const { outcome, obstacle } = resolved;

  const replaced = session.obstacles.map((entry) =>
    entry.instanceId === obstacle.instanceId ? obstacle : entry,
  );

  let next: RunSession = { ...session, obstacles: replaced };

  if (outcome === 'avoided') {
    next = {
      ...next,
      obstaclesAvoided: next.obstaclesAvoided + 1,
      assistance: registerSuccess(next.assistance, next.assistanceConfig),
    };
  } else {
    next = {
      ...next,
      score: scoreCollision(next.score),
      collisions: next.collisions + 1,
      failureReason: resolved.failureReason,
      assistance: registerFailure(next.assistance, next.assistanceConfig),
    };
  }

  // The road goes quiet for a moment before the next hazard, win or lose.
  next = {
    ...next,
    spawner: beginRecovery(next.spawner, next.elapsedMs, next.map.content.recoverySeconds),
  };

  const events: SessionEvent[] = [
    {
      type: 'obstacleResolved',
      obstacle,
      outcome,
      move: moveForOutcome(outcome, obstacle.definition.action),
      failureReason: resolved.failureReason,
    },
  ];

  const cleared = clearPrompt(next);
  next = forget(cleared.session, obstacle.instanceId);
  events.push(...cleared.events);

  if (outcome === 'hit') {
    const beaten = toPhase({ ...next, impactRemainingMs: IMPACT_BEAT_MS }, 'impact');

    return { session: beaten.session, events: [...events, ...beaten.events] };
  }

  return { session: next, events };
}

/**
 * Fires any avoidance move whose moment has come.
 *
 * Only jumps ever wait: see `moveIsDue`. A lane change has already begun by the
 * time this runs.
 */
function startDueMoves(session: RunSession): RunSession {
  const speed = currentSpeed(session);
  const due = session.obstacles.filter((obstacle) =>
    moveIsDue(obstacle, session.playerMeters, speed),
  );
  if (due.length === 0) return session;

  let motion = session.motion;
  for (let index = 0; index < due.length; index += 1)
    motion = beginJump(motion, session.map.motion);

  const started = new Set(due.map((obstacle) => obstacle.instanceId));
  const obstacles = session.obstacles.map((obstacle) =>
    started.has(obstacle.instanceId) ? startMove(obstacle) : obstacle,
  );

  return { ...session, obstacles, motion };
}

/** Runs every live hazard's clock and reacts to what it reports. */
function advanceObstacleLifecycle(session: RunSession): RunSessionResult {
  if (session.obstacles.length === 0) return { session, events: [] };

  const advanced = advanceObstacles(session.obstacles, {
    playerMeters: session.playerMeters,
    speedMetersPerSecond: currentSpeed(session),
    elapsedMs: session.elapsedMs,
  });

  let current: RunSession = { ...session, obstacles: advanced.obstacles };
  const events: SessionEvent[] = [];

  current = startDueMoves(current);

  for (const event of advanced.events) {
    // Once the run is over, nothing else about the road matters.
    if (current.phase !== 'running') break;

    const live = current.obstacles.find((entry) => entry.instanceId === event.obstacle.instanceId);
    if (live === undefined) continue;

    switch (event.type) {
      case 'obstacleWarning':
        events.push({ type: 'obstacleWarning', obstacle: live });
        break;

      case 'promptAttached': {
        const attached = attachObstaclePrompt(current, live);
        current = attached.session;
        events.push(...attached.events);
        break;
      }

      case 'deadlineExpired': {
        // Ran out of time. This fails before the collision plane, because the
        // reserve put the deadline in front of it.
        const expired = expireObstacle(live, current.typing, current.elapsedMs);
        if (expired.resolved === null) break;

        const applied = applyResolution(current, expired.resolved);
        current = applied.session;
        events.push(...applied.events);
        break;
      }

      case 'reachedImpact': {
        const decided = resolveAtImpact({
          obstacle: live,
          motion: current.motion,
          map: current.map,
          typing: current.typing,
          elapsedMs: current.elapsedMs,
        });
        if (decided.resolved === null) break;

        const applied = applyResolution(current, decided.resolved);
        current = applied.session;
        events.push(...applied.events);
        break;
      }
    }
  }

  return { session: current, events };
}

/* -------------------------------------------------------------------------- */
/* The step                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Advances the simulation by one fixed step.
 *
 * Only `running` and `impact` advance. A paused or finished run is frozen, so
 * the elapsed clock every statistic derives from cannot drift while nobody is
 * playing — and neither can a lane change halfway across the road.
 */
export function advanceRunSession(session: RunSession, deltaMs: number): RunSessionResult {
  if (deltaMs <= 0) return { session, events: [] };

  if (session.phase === 'impact') {
    const remaining = session.impactRemainingMs - deltaMs;
    if (remaining > 0) {
      return { session: { ...session, impactRemainingMs: remaining }, events: [] };
    }

    return toPhase({ ...session, impactRemainingMs: 0 }, 'gameOver');
  }

  if (session.phase !== 'running') return { session, events: [] };

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
    motion: advanceMotion(session.motion, deltaMs),
    // Only time spent with a word on screen counts toward WPM.
    activeTypingMs:
      session.challenge === null ? session.activeTypingMs : session.activeTypingMs + deltaMs,
  };

  // Hazards run after movement, so time-to-impact is measured against where the
  // player actually is this step rather than where they were last step.
  const spawned = spawnDueObstacle(advanced);
  const lifecycle = advanceObstacleLifecycle(spawned.session);

  // Coins run after hazards, and only ever in the space hazards leave.
  const coinsSpawned = spawnDueCoins(lifecycle.session);
  const coinLifecycle = advanceCoinLifecycle(coinsSpawned.session);

  const current = coinLifecycle.session;
  const allEvents = [
    ...events,
    ...spawned.events,
    ...lifecycle.events,
    ...coinsSpawned.events,
    ...coinLifecycle.events,
  ];

  // A hazard resolved into an impact beat this step; the finish line does not
  // rescue a player who has already hit something.
  if (current.phase !== 'running') return { session: current, events: allEvents };

  if (current.playerMeters >= current.map.distanceMeters) {
    const finished = toPhase(
      { ...current, playerMeters: current.map.distanceMeters },
      'levelComplete',
    );

    return { session: finished.session, events: [...allEvents, ...finished.events] };
  }

  return { session: current, events: allEvents };
}

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

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
    // A mistake breaks the combo the moment it happens. It does not end the run:
    // accuracy is a statistic the progression gates on, and a game that ends on
    // one slip cannot measure it.
    const mistyped = typing.incorrectCharacters > session.typing.incorrectCharacters;

    return { session: mistyped ? { ...typed, score: breakCombo(typed.score) } : typed, events: [] };
  }

  const challenge = typed.challenge;
  if (challenge === null) return { session: typed, events: [] };

  return challenge.kind === 'hazard'
    ? commitToAvoidance(typed, challenge.id)
    : commitToCoins(typed, challenge.id);
}

/**
 * The word was finished in time. Start the move and pay out.
 *
 * Points, combo, and boost land here rather than at the collision plane,
 * because this is the moment the player earned them and the moment they expect
 * the feedback. What is still outstanding is only whether their body gets clear
 * — and the reserve is what makes that a formality rather than a gamble.
 */
function commitToAvoidance(session: RunSession, instanceId: string): RunSessionResult {
  const obstacle = session.obstacles.find((entry) => entry.instanceId === instanceId);

  // Expired on the same step, or already resolved.
  if (obstacle === undefined || obstacle.status !== 'active') {
    return { session, events: [] };
  }

  const committed = commitObstacle(obstacle, session.elapsedMs);

  const scored = scorePromptCompleted(session.score, {
    correctCharacters: session.typing.correctCharacters,
    incorrectCharacters: session.typing.incorrectCharacters,
    isObstacle: true,
    expectedTypingMs: obstacle.timing.expectedTypingMs,
    actualTypingMs: session.elapsedMs - session.promptStartedMs,
    // Finishing early is worth something: it is the difference between clearing
    // a hazard and scraping past it.
    remainingMs:
      obstacle.deadlineAtMs === null ? 0 : Math.max(0, obstacle.deadlineAtMs - session.elapsedMs),
  });

  const isJump = obstacle.definition.action === 'jump';
  // A lane change starts now — moving early is only ever safer. A jump waits
  // until the obstacle is one reserve away, or it would land before arriving.
  const moved = isJump ? committed : startMove(committed);
  const motion = isJump ? session.motion : startAvoidanceMove(session, moved);

  const next: RunSession = {
    ...session,
    obstacles: session.obstacles.map((entry) => (entry.instanceId === instanceId ? moved : entry)),
    motion,
    score: scored,
    completedPrompts: session.completedPrompts + 1,
    // Clearing a hazard is what earns speed. There are no other prompts to earn
    // it from any more.
    boostRemainingMs: Math.max(
      session.boostRemainingMs,
      boostDurationMs(session.map.boost, obstacle.prompt.normalizedText.length),
    ),
  };

  const move = moveForOutcome('avoided', obstacle.definition.action);
  const points = scored.score - session.score.score;

  return {
    session: next,
    events: [
      { type: 'promptCompleted', prompt: obstacle.prompt, points },
      { type: 'obstacleCommitted', obstacle: moved, move, points },
      { type: 'boostStarted' },
    ],
  };
}

/** Starts the lane change the hazard asks for. */
function startAvoidanceMove(session: RunSession, obstacle: ActiveObstacle): PlayerMotion {
  if (obstacle.safeLane === null) return session.motion;

  // Preempt: a coin swerve may be in flight, and a player who typed their way
  // out of a car must never be refused because they were collecting.
  return beginLaneChange(session.motion, obstacle.safeLane, session.map.motion, { preempt: true });
}

/* -------------------------------------------------------------------------- */
/* Coins                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Puts a line of coins in the gap, if the road is quiet enough for one.
 *
 * Three conditions, all of them about not competing with a hazard: nothing
 * unresolved on the road, nothing already collecting, and the next hazard far
 * enough away that the swerve is over before it matters.
 */
function spawnDueCoins(session: RunSession): RunSessionResult {
  if (session.elapsedMs < session.nextCoinAtMs) return { session, events: [] };
  if (hasLiveHazard(session)) return { session, events: [] };
  if (session.coins.some(isCoinLive)) return { session, events: [] };

  const drawn = nextPrompt(session.selector, session.pool, {
    mapNumber: session.map.mapNumber,
    // Short words only, whatever the map draws on elsewhere. A coin line is a
    // detour, and a detour that takes longer than the hazard it sits between is
    // not a detour, it is the road.
    categories: COIN_CATEGORIES,
    usage: 'boost',
    preferredTags: session.map.content.themeTags,
  });

  if (drawn.prompt === null) {
    return { session: { ...session, selector: drawn.selector }, events: [] };
  }

  const placed = placeCoin({
    instanceId: `coin-${String(session.coins.length + 1)}`,
    prompt: drawn.prompt,
    map: session.map,
    playerLane: targetLane(session.motion),
    playerMeters: session.playerMeters,
    elapsedMs: session.elapsedMs,
    speedMetersPerSecond: placementSpeed(session),
    rng: session.coinRng,
  });

  return {
    session: {
      ...session,
      selector: drawn.selector,
      coinRng: placed.rng,
      coins: [...session.coins, placed.coin],
      nextCoinAtMs: session.elapsedMs + session.map.content.coinIntervalSeconds * 1_000,
    },
    events: [{ type: 'coinSpawned', coin: placed.coin }],
  };
}

/** Runs every live coin line's clock. Nothing here can end a run. */
function advanceCoinLifecycle(session: RunSession): RunSessionResult {
  if (session.coins.length === 0) return { session, events: [] };

  const speed = currentSpeed(session);
  const events: SessionEvent[] = [];
  let current = session;
  const kept: ActiveCoin[] = [];

  for (const coin of session.coins) {
    const result = advanceCoin(coin, {
      playerMeters: session.playerMeters,
      speedMetersPerSecond: speed,
      elapsedMs: session.elapsedMs,
    });

    let latest = result.coin;

    for (const event of result.events) {
      if (event.type === 'coinWordAttached') {
        const attached = attachCoinPrompt(current, latest);
        current = attached.session;
        events.push(...attached.events);
        continue;
      }

      if (event.type === 'coinExpired') {
        current = {
          ...current,
          coinsMissed: current.coinsMissed + 1,
          nextCoinAtMs: current.elapsedMs + current.map.content.coinIntervalSeconds * 1_000,
        };
        current = releaseCoinField(current, latest.instanceId, events);
        continue;
      }

      // Reached the coins. Either the player is in the lane or they are not.
      const resolution = resolveCoin(latest, session.motion.lane, isSettled(session.motion));
      latest = resolution.coin;

      current = {
        ...current,
        coinsCollected: current.coinsCollected + (resolution.collected ? 1 : 0),
        coinsMissed: current.coinsMissed + (resolution.collected ? 0 : 1),
        score: resolution.collected ? awardCoins(current.score, resolution.value) : current.score,
        // The next line is measured from this one ending, so the rhythm is
        // hazard, gap, coins, gap — rather than a coin clock that drifts.
        nextCoinAtMs: current.elapsedMs + current.map.content.coinIntervalSeconds * 1_000,
      };
      current = releaseCoinField(current, latest.instanceId, events);

      events.push({
        type: 'coinResolved',
        coin: latest,
        collected: resolution.collected,
        value: resolution.value,
      });
    }

    // Forget coins well behind the player rather than growing the list forever.
    const behind = distanceToCoins(latest, session.playerMeters) < -COIN_DESPAWN_METERS;
    if (isCoinLive(latest) || !behind) kept.push(latest);
  }

  return { session: { ...current, coins: kept }, events };
}

/** Hands the typing field back, if this coin line was holding it. */
function releaseCoinField(
  session: RunSession,
  instanceId: string,
  events: SessionEvent[],
): RunSession {
  if (session.challenge?.kind !== 'coin' || session.challenge.id !== instanceId) return session;

  const cleared = clearPrompt(session);
  events.push(...cleared.events);

  return cleared.session;
}

/** The word on a coin line was finished. Start the swerve. */
function commitToCoins(session: RunSession, instanceId: string): RunSessionResult {
  const coin = session.coins.find((entry) => entry.instanceId === instanceId);
  if (coin === undefined || coin.status !== 'active') return { session, events: [] };

  const committed = commitCoin(coin, session.elapsedMs);
  // No preempt. Coins never interrupt a hazard's move, which is the whole
  // reason they are safe to have on the road at all.
  const motion = beginLaneChange(session.motion, committed.lane, session.map.motion);

  return {
    session: {
      ...session,
      coins: session.coins.map((entry) => (entry.instanceId === instanceId ? committed : entry)),
      motion,
      completedPrompts: session.completedPrompts + 1,
    },
    events: [{ type: 'promptCompleted', prompt: coin.prompt, points: 0 }],
  };
}

/* -------------------------------------------------------------------------- */
/* Reporting                                                                  */
/* -------------------------------------------------------------------------- */

/** The snapshot the HUD renders, built on demand rather than tracked. */
export function liveStats(session: RunSession): LiveRunStats {
  return {
    currentWpm: currentWpm(session.stats, session.elapsedMs),
    // Divided by time spent typing, not by run time — see `activeTypingMs`.
    averageWpm: averageWpm(session.stats, session.activeTypingMs),
    accuracy: runAccuracy(session.stats),
    combo: session.score.combo,
    score: session.score.score,
    progress: runProgress(session),
    speedMetersPerSecond: currentSpeed(session),
    lanePosition: lanePosition(session.motion),
    coins: session.coinsCollected,
    elapsedMs: session.elapsedMs,
  };
}

/** The hazard currently holding the typing field, if any. */
export function activeObstacle(session: RunSession): ActiveObstacle | null {
  if (session.challenge?.kind !== 'hazard') return null;
  const id = session.challenge.id;

  return session.obstacles.find((entry) => entry.instanceId === id) ?? null;
}

/** The coin line currently holding the typing field, if any. */
export function activeCoin(session: RunSession): ActiveCoin | null {
  if (session.challenge?.kind !== 'coin') return null;
  const id = session.challenge.id;

  return session.coins.find((entry) => entry.instanceId === id) ?? null;
}

/** Hazards cleared as a fraction of hazards resolved. 1 when none were. */
export function obstacleSuccessRate(session: RunSession): number {
  const resolvedCount = session.obstaclesAvoided + session.collisions;
  if (resolvedCount === 0) return 1;

  return session.obstaclesAvoided / resolvedCount;
}

/** Is the player mid-move, and therefore unable to accept another hazard? */
export function isMoving(session: RunSession): boolean {
  return !isSettled(session.motion);
}
