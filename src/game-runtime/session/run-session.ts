import {
  type AssistanceState,
  assistedMap,
  createAssistance,
  registerFailure,
  registerSuccess,
} from '../../game-core/assistance';
import { createPromptSelector, nextPrompt, type PromptSelector } from '../../game-core/content';
import {
  type ActiveFlowWord,
  completeFlowWord,
  expireFlowWord,
  flowExpired,
  placeFlowWord,
} from '../../game-core/flow';
import type {
  AdaptiveAssistanceConfig,
  FailureReason,
  LaneIndex,
  LiveRunStats,
  MapConfig,
  PromptCategory,
  PromptEntry,
} from '../../game-core/models';
import { CENTRE_LANE, DEFAULT_ADAPTIVE_ASSISTANCE } from '../../game-core/models';
import {
  advanceMotion,
  beginLaneChange,
  BOOSTING_THRESHOLD,
  createPlayerMotion,
  decayMomentum,
  isSettled,
  lanePosition,
  momentumMultiplier,
  momentumShare,
  type PlayerMotion,
  rampedSpeed,
  targetLane,
  topUpMomentum,
} from '../../game-core/motion';
import {
  type ActivePowerup,
  advanceEffects,
  advancePowerup,
  claimPowerup,
  distanceToPowerup,
  forfeitPowerup,
  grantPowerup,
  hasMagnet,
  isPowerupLive,
  NO_EFFECTS,
  placePowerup,
  type PowerupEffects,
  spendShield,
} from '../../game-core/powerups';
import {
  type ActiveCoin,
  advanceCoin,
  commitCoin,
  distanceToCoins,
  coinsTaken,
  isCoinLive,
  placeCoin,
} from '../../game-core/pickups';
import {
<<<<<<< Updated upstream
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
  reserveMsFor,
  placeObstacle,
  resolveAtImpact,
  type ResolvedObstacle,
  startMove,
  type SpawnerState,
} from '../../game-core/obstacles';
=======
  applyClear as pursuitClear,
  applyFlowMiss as pursuitFlowMiss,
  applyMistake as pursuitMistake,
  createPursuit,
  isCaught,
  type PursuitConfig,
  pursuitConfigFor,
  pursuitPressure,
  type PursuitState,
} from '../../game-core/pursuit';
import { EMPTY_KEY_STATS, recordAttempts, type KeyStats } from '../../game-core/keystats';
>>>>>>> Stashed changes
import { createRngFromString, type Rng } from '../../game-core/random';
import {
  awardCoins,
  breakCombo,
  createScoreState,
<<<<<<< Updated upstream
  registerCollision as scoreCollision,
=======
  DEFAULT_SCORING_CONFIG,
>>>>>>> Stashed changes
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
  readonly kind: 'coin' | 'powerup' | 'flow';
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

/**
 * What a powerup sentence is drawn from.
 *
 * Phrases, deliberately. A powerup asks a different question from everything
 * else in the game — not "can you do this fast" but "can you do this cleanly" —
 * and one word is too short to answer it.
 */
const POWERUP_CATEGORIES = ['short-phrase', 'medium-phrase'] as const;

/**
 * When the first crate is due, as a fraction of the interval.
 *
 * One, deliberately — the first powerup is a full interval in, like every one
 * after it. Bringing it forward to half an interval was tried and it dropped a
 * perfect typist's finish rate from 100% to as low as 31%: a sentence early in
 * a run displaces the hazard schedule at exactly the point the player has the
 * least speed banked. Powerups are a reward for surviving a while, and the
 * tuning turns out to agree.
 */
const FIRST_POWERUP_FACTOR = 1;

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
<<<<<<< Updated upstream
  /** Milliseconds of boost left, or 0. Earned by clearing a hazard. */
  readonly boostRemainingMs: number;
=======
  /**
   * How fast the player is currently going, as a level from 0 to 1.
   *
   * Earned, not given: every word finished tops it up by what that word was
   * worth, and it drains the whole time. A word finished with most of its
   * budget to spare pays the map's full multiplier; one scraped in pays a
   * floor. That is what makes typing faster than the deadline demands worth
   * doing — before it, clearing at 20 WPM and at 60 produced the same speed.
   *
   * Never worth more than `map.boost.speedMultiplier`, which matters:
   * `placementSpeed` measures placement against that ceiling, so a speed that
   * could exceed it would let the player arrive early at a deadline that
   * assumed they could not. See `game-core/motion/momentum.ts` for why this is
   * a level rather than the countdown it used to be.
   */
  readonly momentum: number;
  /**
   * Which keys this run has fumbled (plan 2.4).
   *
   * Accumulated live so the run can be weighted toward them as it goes, and
   * folded into the profile when it ends.
   */
  readonly keyStats: KeyStats;
  /** Characters to steer this run's vocabulary toward. Fixed for the run. */
  readonly weakCharacters: readonly string[];
  /**
   * The chaser (plan 1.3).
   *
   * A gap in metres. It responds to margin, mistakes and lapsed gap words, and
   * at zero the run ends — see `game-core/pursuit`.
   */
  readonly pursuit: PursuitState;
  /**
   * The chaser's own tuning, derived from the map (`pursuit/tuning.ts`).
   *
   * Carried on the session rather than defaulted at each call site: the
   * break-even margin is the map's difficulty, and a call that forgot to pass
   * it would quietly put every map back on the same ladder rung.
   */
  readonly pursuitConfig: PursuitConfig;
>>>>>>> Stashed changes
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

  /** Adaptive assistance (spec §6). Moves the reaction buffer, nothing else. */
  readonly assistance: AssistanceState;
  readonly assistanceConfig: AdaptiveAssistanceConfig;
  /** Coin lines currently in the world. At most one unresolved. */
  readonly coins: readonly ActiveCoin[];
  /** Powerup crates currently in the world. At most one unresolved. */
  readonly powerups: readonly ActivePowerup[];
  /** Run time the next powerup crate may appear. */
  readonly nextPowerupAtMs: number;
  readonly powerupRng: Rng;
  /** What the player is currently carrying. */
  readonly effects: PowerupEffects;
  /** Run time the next coin line may appear. */
  readonly nextCoinAtMs: number;
  readonly coinRng: Rng;
  /**
   * The word on screen when nothing on the road is asking for one.
   *
   * The gap-filler, and the reason a run is a typing workout rather than a
   * sequence of short sprints between long waits. See `game-core/flow`.
   */
  readonly flow: ActiveFlowWord | null;
  readonly flowIndex: number;

  /** The map's secret, as words in order. Empty when the map has none. */
  readonly secretWords: readonly PromptEntry[];
  /** How many of them have been typed. */
  readonly secretIndex: number;

  readonly completedPrompts: number;
  readonly coinsCollected: number;
  readonly coinsMissed: number;
  readonly powerupsClaimed: number;
  readonly powerupsLost: number;
  readonly flowWordsCompleted: number;
  readonly flowWordsMissed: number;
  /** Crashes a shield absorbed. Survived, so not collisions. */
  readonly savedByShield: number;
}

export type SessionEvent =
  | { readonly type: 'promptChanged'; readonly prompt: PromptEntry | null }
  | { readonly type: 'promptCompleted'; readonly prompt: PromptEntry; readonly points: number }
  | { readonly type: 'boostStarted' }
  | { readonly type: 'boostEnded' }
<<<<<<< Updated upstream
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
=======
>>>>>>> Stashed changes
  | { readonly type: 'coinSpawned'; readonly coin: ActiveCoin }
  | { readonly type: 'coinAttached'; readonly coin: ActiveCoin }
  | {
      readonly type: 'coinCollected';
      readonly coin: ActiveCoin;
      readonly index: number;
      readonly collected: boolean;
      readonly value: number;
    }
  | {
      readonly type: 'coinResolved';
      readonly coin: ActiveCoin;
      readonly collected: boolean;
      readonly value: number;
    }
  | { readonly type: 'powerupSpawned'; readonly powerup: ActivePowerup }
  | { readonly type: 'powerupAttached'; readonly powerup: ActivePowerup }
  | { readonly type: 'powerupClaimed'; readonly powerup: ActivePowerup }
  | {
      readonly type: 'powerupLost';
      readonly powerup: ActivePowerup;
      /** A mistake, or simply out of time. */
      readonly reason: 'mistake' | 'timeout';
    }
  | { readonly type: 'flowWordCompleted'; readonly word: ActiveFlowWord; readonly points: number }
  | { readonly type: 'flowWordMissed'; readonly word: ActiveFlowWord }
  | { readonly type: 'shieldSpent'; readonly remaining: number }
  | { readonly type: 'phaseChanged'; readonly phase: RunPhase };

export interface RunSessionResult {
  readonly session: RunSession;
  readonly events: readonly SessionEvent[];
}

export interface CreateRunSessionInput {
  readonly map: MapConfig;
  readonly pool: readonly PromptEntry[];
  /**
   * The map's secret, as words, in the order they must be typed.
   *
   * Every prompt in a run comes from here while any is left — hazards, coins and
   * gap words alike, so the whole run assembles one sentence. When it runs out
   * the run falls back to the map's own vocabulary, which is what stops a fast
   * player running out of anything to type.
   */
  readonly secretWords?: readonly PromptEntry[];
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
<<<<<<< Updated upstream
    boostRemainingMs: 0,
=======
    momentum: 0,
    keyStats: EMPTY_KEY_STATS,
    weakCharacters: input.weakCharacters ?? [],
    pursuit: createPursuit(pursuitConfigFor(input.map)),
    pursuitConfig: pursuitConfigFor(input.map),
>>>>>>> Stashed changes
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
    coinRng: createRngFromString(`${input.seed}:coins`),
    coins: [],
    flow: null,
    flowIndex: 0,
    secretWords: input.secretWords ?? [],
    secretIndex: 0,
    nextCoinAtMs: input.map.content.coinIntervalSeconds * 1_000,
    powerupRng: createRngFromString(`${input.seed}:powerups`),
    powerups: [],
    nextPowerupAtMs: input.map.content.powerupIntervalSeconds * 1_000 * FIRST_POWERUP_FACTOR,
    effects: NO_EFFECTS,
    assistance: createAssistance(),
    assistanceConfig: input.assistance ?? DEFAULT_ADAPTIVE_ASSISTANCE,
    completedPrompts: 0,
    coinsCollected: 0,
    coinsMissed: 0,
    powerupsClaimed: 0,
    powerupsLost: 0,
    flowWordsCompleted: 0,
    flowWordsMissed: 0,
    savedByShield: 0,
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

<<<<<<< Updated upstream
  return session.boostRemainingMs > 0 ? ramped * session.map.boost.speedMultiplier : ramped;
=======
  return ramped * momentumMultiplier(session.momentum, session.map.boost.speedMultiplier);
>>>>>>> Stashed changes
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
  return session.momentum > BOOSTING_THRESHOLD;
}

/**
 * Momentum after finishing a word, pushing `boostStarted` if this is the one
 * that got the player moving.
 *
 * Every completed prompt pays, not only the dangerous ones. When hazards were
 * the only way to earn speed a player could type continuously and still crawl,
 * because the thing they were typing happened not to be the thing that paid.
 */
function earnMomentum(session: RunSession, marginFraction: number, events: SessionEvent[]): number {
  const next = topUpMomentum(session.momentum, momentumShare(marginFraction));
  if (session.momentum <= BOOSTING_THRESHOLD && next > BOOSTING_THRESHOLD) {
    events.push({ type: 'boostStarted' });
  }

  return next;
}

/** How much of a prompt's budget was left when it was finished, 0..1. */
function marginOf(availableMs: number, remainingMs: number): number {
  return availableMs > 0 ? Math.max(0, Math.min(1, remainingMs / availableMs)) : 0;
}

/** Progress to the finish line, 0..1. */
export function runProgress(session: RunSession): number {
  if (session.map.distanceMeters <= 0) return 1;

  return Math.min(1, session.playerMeters / session.map.distanceMeters);
}

<<<<<<< Updated upstream
=======
/**
 * The map as it stands *right now*, with escalation applied.
 *
 * Only the endless map declares any, so on the six fixed maps this returns the
 * map unchanged and costs one property read.
 *
 * The target speed is what every timing budget is derived from, so raising it
 * over the course of a run is what actually makes a run get harder — see the
 * note on `EscalationProfile` for why raising the world speed does not.
 */
function pacedMap(session: RunSession): MapConfig {
  const escalation = session.map.escalation;
  if (escalation === undefined) return session.map;

  const minutes = session.elapsedMs / 60_000;
  const wanted = session.map.targetWpm + escalation.wpmPerMinute * minutes;

  return { ...session.map, targetWpm: Math.min(escalation.maxWpm, wanted) };
}

/**
 * The map every budget is actually measured against.
 *
 * The map as written, paced for an endless run's escalation, then eased by
 * whatever adaptive assistance has decided. One helper rather than three call
 * sites, because a prompt placed against a different map from the one beside it
 * is a fairness bug nobody would see until a playtest.
 */
function activeMap(session: RunSession): MapConfig {
  return assistedMap(pacedMap(session), session.assistance);
}

/** A map with no finish line. How far you got is the whole score (plan 2.2). */
export function isEndless(map: { readonly distanceMeters: number }): boolean {
  return map.distanceMeters <= 0;
}

>>>>>>> Stashed changes
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
/* The sentence                                                               */
/* -------------------------------------------------------------------------- */

/** The word the map's secret is waiting on, or `null` once it is finished. */
export function pendingSecretWord(session: RunSession): PromptEntry | null {
  return session.secretWords[session.secretIndex] ?? null;
}

/** Every word of the secret has been typed. */
export function secretComplete(session: RunSession): boolean {
  return session.secretWords.length > 0 && session.secretIndex >= session.secretWords.length;
}

/** How far through the sentence the player is, 0..1. */
export function secretProgress(session: RunSession): number {
  if (session.secretWords.length === 0) return 0;

  return Math.min(1, session.secretIndex / session.secretWords.length);
}

/**
 * The next word for any encounter.
 *
 * The sentence first, and the map's own vocabulary only once the sentence is
 * finished. One source for hazards, coins, crates and gap words alike, which is
 * what makes a run assemble a single readable thing rather than four parallel
 * streams of unrelated words.
 */
function drawPrompt(
  session: RunSession,
  criteria: {
    readonly categories: readonly PromptCategory[];
    readonly usage: 'boost' | 'obstacle';
  },
): { readonly prompt: PromptEntry | null; readonly session: RunSession } {
  const chunk = takeSecretChunk(session, ENCOUNTER_MIN_CHARACTERS, ENCOUNTER_MAX_WORDS);
  if (chunk !== null) return { prompt: chunk, session };

  const drawn = nextPrompt(session.selector, session.pool, {
    mapNumber: session.map.mapNumber,
    categories: criteria.categories,
    usage: criteria.usage,
    preferredTags: session.map.content.themeTags,
  });

  return { prompt: drawn.prompt, session: { ...session, selector: drawn.selector } };
}

/**
 * Shortest a sentence prompt is allowed to be, in characters.
 *
 * Short words are *generous*, not hard, and the reason is the flat part of the
 * timing budget: a hazard hands out a fixed reaction allowance on top of the
 * typing time, so "the" on Map 1 gets 2.4 seconds for 1.8 seconds of typing and
 * demands about 15 WPM on a map that advertises 20. A sentence is full of such
 * words, and left one-per-encounter they drag every map below its own number.
 *
 * So a prompt takes words until it is worth asking for. "of our" instead of
 * "of", then "our" — same sentence, same order, one real ask instead of two
 * free ones.
 */
const ENCOUNTER_MIN_CHARACTERS = 6;

/** Most words one encounter will glue together, however short they are. */
const ENCOUNTER_MAX_WORDS = 3;

/**
 * The next run of sentence words, as one prompt.
 *
 * The id is the first word's id with the word count appended, which is how
 * `advanceSecret` knows how far to move the sentence on when it is typed. That
 * keeps the span in the prompt itself rather than in a session field that could
 * drift out of step with the word on screen.
 */
function takeSecretChunk(
  session: RunSession,
  minCharacters: number,
  maxWords: number,
): PromptEntry | null {
  const taken: PromptEntry[] = [];
  let characters = 0;

  for (let index = session.secretIndex; index < session.secretWords.length; index += 1) {
    const word = session.secretWords[index];
    if (word === undefined) break;

    taken.push(word);
    characters += word.normalizedText.length + (taken.length > 1 ? 1 : 0);

    if (characters >= minCharacters || taken.length >= maxWords) break;
  }

  const first = taken[0];
  if (first === undefined) return null;
  if (taken.length === 1) return first;

  const text = taken.map((word) => word.normalizedText).join(' ');

  return {
    id: `${first.id}+${String(taken.length)}`,
    text,
    normalizedText: text,
    difficulty: Math.min(1, text.length / 20),
    category: text.length <= 14 ? 'short-phrase' : 'medium-phrase',
    minimumMap: 1,
    usage: 'both',
    tags: ['secret'],
  };
}

/**
 * Words a crate asks for in one go, while the sentence is running.
 *
 * A clause, not a word. The powerup's whole character is "type this much,
 * perfectly", and one word of a sentence cannot carry that.
 */
const POWERUP_SECRET_WORDS = 4;

/** The crate's prompt: the next clause of the sentence, or a phrase from the pool. */
function drawPowerupPrompt(session: RunSession): {
  readonly prompt: PromptEntry | null;
  readonly session: RunSession;
} {
  const clause = takeSecretChunk(session, POWERUP_MIN_CHARACTERS, POWERUP_SECRET_WORDS);
  if (clause !== null) return { prompt: clause, session };

  const drawn = nextPrompt(session.selector, session.pool, {
    categories: POWERUP_CATEGORIES,
    mapNumber: session.map.mapNumber,
    usage: 'boost',
    preferredTags: session.map.content.themeTags,
  });

  return { prompt: drawn.prompt, session: { ...session, selector: drawn.selector } };
}

/** Shortest a crate's clause may be. Long enough that typing it clean means something. */
const POWERUP_MIN_CHARACTERS = 22;

/**
 * A word was typed. If it was the sentence's, the sentence moves on.
 *
 * Only completion advances it. A word the player never finished — a coin they
 * declined, a gap word that lapsed — comes back on the next encounter, so the
 * sentence never ends up with a hole in it and declining a coin never costs the
 * secret.
 */
function advanceSecret(session: RunSession, prompt: PromptEntry): RunSession {
  const pending = pendingSecretWord(session);
  if (pending === null) return session;

  // One word carries its own id; several carry the first word's id with the
  // count appended. The span travels with the prompt rather than in a session
  // field, so it cannot drift out of step with the word on screen.
  let words = 0;
  if (prompt.id === pending.id) words = 1;
  else if (prompt.id.startsWith(`${pending.id}+`)) {
    words = Number.parseInt(prompt.id.slice(pending.id.length + 1), 10);
  }

  if (!Number.isFinite(words) || words < 1) return session;

  return {
    ...session,
    secretIndex: Math.min(session.secretWords.length, session.secretIndex + words),
  };
}

/* -------------------------------------------------------------------------- */
/* The typing field                                                          */
/* -------------------------------------------------------------------------- */

<<<<<<< Updated upstream
/** Hazards still owed an outcome, answered or not. */
function unresolvedHazards(session: RunSession): readonly ActiveObstacle[] {
  return session.obstacles.filter(
    (entry) =>
      entry.status === 'approaching' || entry.status === 'active' || entry.status === 'committed',
  );
}

/**
 * True while a hazard is unresolved at all.
 *
 * Coins and powerups wait for this: they are optional, and an optional detour
 * that competes with a hazard for the same seconds is a trap.
 */
function hasLiveHazard(session: RunSession): boolean {
  return unresolvedHazards(session).length > 0;
}

/**
 * A hazard the player still owes a *word* for.
 *
 * The distinction the gap word rests on. A committed hazard is answered — the
 * points are paid, the move is under way — and all that is left is the body
 * travelling to the collision plane. Nothing that needs the body can happen in
 * that stretch, which is why coins, crates and the next hazard all wait for it.
 * A word needs no body, so a gap word may run there, anchored to the very
 * obstacle the player is in the middle of dodging.
 *
 * **The spawner does not use this.** Letting the next hazard spawn during the
 * tail was tried twice and ends every run inside fifteen seconds; see
 * `obstacles/README.md` and CLAUDE.md. Bodies stay strictly serialised.
 */
function hasUnansweredHazard(session: RunSession): boolean {
  return session.obstacles.some(
    (entry) => entry.status === 'approaching' || entry.status === 'active',
  );
}

/**
 * The nearest hazard still owed an outcome.
 *
 * Moves are strictly serialised through this one. The player has to stay where
 * the nearest hazard demands until its collision plane is behind them — moving
 * early for the *next* hazard would turn one they had already beaten into a
 * crash. Words queue; bodies do not.
 */
function leadingHazard(session: RunSession): ActiveObstacle | null {
  let leader: ActiveObstacle | null = null;

  for (const hazard of unresolvedHazards(session)) {
    if (leader === null || hazard.impactMeters < leader.impactMeters) leader = hazard;
  }

  return leader;
}

/**
 * The lane the player will be in once every queued move has happened.
 *
 * Not `targetLane(motion)`, and the difference is the whole reason queued
 * hazards work. A committed hazard's move is *deferred* until the one in front
 * of it resolves, so the motion state does not yet know where the player is
 * going. Assigning the next hazard around their current lane would put its safe
 * lane wherever they happen to be standing now — which is how a faster typist
 * ended up with a worse road than a slow one, because answering early is what
 * queues a move in the first place.
 */
function predictedLane(session: RunSession): LaneIndex {
  let lane = targetLane(session.motion);

  const queued = [...unresolvedHazards(session)].sort((a, b) => a.impactMeters - b.impactMeters);
  for (const hazard of queued) {
    if (hazard.definition.action === 'lane-change' && hazard.safeLane !== null) {
      lane = hazard.safeLane;
    }
  }

  return lane;
}

/**
 * Breathing room between two collision planes, on top of the move itself.
 *
 * Enough that a queued move starts, completes, and settles before the next
 * plane arrives — with room for the fixed simulation step to land wherever it
 * lands.
 */
const PLANE_MARGIN_MS = 500;

/** Spawns whatever the schedule says is due and places it in the world. */
function spawnDueObstacle(session: RunSession): RunSessionResult {
  if (session.obstaclePool.length === 0) return { session, events: [] };

  /*
   * A due coin line or crate outranks a hazard, the same way a due crate already
   * outranks a coin line.
   *
   * Hazards are scheduled every fraction of a second and only ever wait for the
   * road, so once they stopped waiting for gap words they took every gap there
   * was and the pickups starved: measured at zero coins and zero crates a run on
   * Maps 1 and 2. Precedence, not a longer interval, is the fix — a hazard that
   * yields here is delayed by one encounter, while a coin line that loses its
   * turn is gone until the next one comes round.
   */
  if (session.elapsedMs >= session.nextCoinAtMs) return { session, events: [] };
  if (session.elapsedMs >= session.nextPowerupAtMs) return { session, events: [] };

  const due = advanceSpawner(session.spawner, session.elapsedMs, {
    content: session.map.content,
    mapNumber: session.map.mapNumber,
    pool: session.obstaclePool,
    hazardsLive: hasLiveHazard(session),
    /*
     * A hazard still waits for anything on the road — a coin line or a crate
     * owns its stretch from approach to collection, and sharing it does not
     * work. A car ordered into the middle of a coin run drags the player off the
     * row; a jump lifts them over it. Both leave coins the player has already
     * paid for on the tarmac, so both were measured and both were rejected.
     *
     * A *gap word* is the one thing it no longer waits for, and that is the
     * whole change. It has no body, so there is nothing for a hazard to collide
     * with, and dropping it costs nothing — see `dropFlowWord`. It used to sit in
     * this condition, which meant the filler invented to cover the gaps was
     * itself creating them: on Map 1 that was 3.5 seconds of delay per encounter
     * and 63% of the run spent on filler or empty road.
     */
    coinsLive: session.coins.some(isCoinLive) || session.powerups.some(isPowerupLive),
  });

  const definition = due.spawned;
  if (definition === null) return { session: { ...session, spawner: due.state }, events: [] };

  // The sentence first; the hazard's own category is the fallback for after it
  // is finished. A hazard takes whatever word is next rather than choosing one,
  // which is what keeps the run assembling a single sentence.
  const drawn = drawPrompt(session, {
    categories: [definition.promptCategory],
    usage: 'obstacle',
  });
  const withPrompt = drawn.session;

  // No prompt in the pool fits this hazard's category. Skipping it is the
  // honest failure: spawning something untypeable would be a free collision.
  if (drawn.prompt === null) {
    return { session: { ...withPrompt, spawner: due.state }, events: [] };
  }

  const assigned = assignLanes(session.laneRng, {
    action: definition.action,
    // Where they will be once everything already on the road has been answered
    // — not where they are standing while they answer it.
    playerLane: predictedLane(session),
    doubleBlockChance: session.map.content.doubleBlockChance,
  });

  const index = session.obstaclesFaced + 1;
  const placed = placeObstacle({
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

  const obstacle = withClearRoad(placed, session);

  return {
    session: {
      ...withPrompt,
      spawner: due.state,
      laneRng: assigned.rng,
      obstacles: [...session.obstacles, obstacle],
      obstaclesFaced: index,
    },
    events: [{ type: 'obstacleSpawned', obstacle }],
  };
}

/**
 * Pushes a new hazard back until its collision plane has room.
 *
 * With words queued, two hazards can be in flight at once — and if their planes
 * land within a move of each other the second one is unanswerable: its jump or
 * lane change cannot start until the first is resolved, and by then there is no
 * road left to do it in. That shows up as `late-move` on a hazard the player
 * typed perfectly, which is the worst failure this game can produce.
 *
 * So the planes are spaced by the move the *new* hazard will need, plus a
 * margin. This is the only place placement is adjusted after the timing budget
 * has spoken, and it only ever moves a hazard further away.
 */
function withClearRoad(obstacle: ActiveObstacle, session: RunSession): ActiveObstacle {
  const unresolved = unresolvedHazards(session);
  if (unresolved.length === 0) return obstacle;

  const nearestPlane = Math.max(...unresolved.map((entry) => entry.impactMeters));
  const separationMs = reserveMsFor(obstacle, session.map) + PLANE_MARGIN_MS;
  const separationMeters = spawnDistanceMeters(separationMs, placementSpeed(session));
  const earliest = nearestPlane + separationMeters;

  return obstacle.impactMeters >= earliest ? obstacle : { ...obstacle, impactMeters: earliest };
}

/**
 * Hands the typing field to a hazard. Its word is mandatory.
 *
 * A coin word on screen is abandoned here, and deliberately: the player has one
 * word to read and it had better be the one that can end their run.
 */
function attachObstaclePrompt(session: RunSession, obstacle: ActiveObstacle): RunSessionResult {
  const abandoned = dropFlowWord(abandonUncommittedCoins(session));

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

=======
>>>>>>> Stashed changes
/** Hands the typing field to a coin line. Its word is optional. */
function attachCoinPrompt(session: RunSession, coin: ActiveCoin): RunSessionResult {
  return {
    session: {
      ...dropFlowWord(session),
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

/** Clears the typing field. A flow word takes it back on the same step. */
function clearPrompt(session: RunSession): RunSessionResult {
  if (session.prompt === null && session.challenge === null) return { session, events: [] };

  return {
    session: { ...session, prompt: null, typing: createTypingState(''), challenge: null },
    events: [{ type: 'promptChanged', prompt: null }],
  };
}

/**
 * Starts a committed coin swerve that was refused when it was asked for.
 *
 * `beginLaneChange` refuses while a jump is in the air, and `commitToCoins`
 * asked exactly once. So a coin line whose word was finished mid-jump was
 * marked `committed`, never moved, and every coin in it went by underneath a
 * player who had already typed for them — the one thing coins promise not to do.
 *
 * Nothing jumps any more, so the refusal is rarer than it was; the retry stays
 * because flight still lifts the player off the road, and a coin line answered
 * while flying is exactly the case this covers.
 */
function retryCoinSwerve(session: RunSession): RunSession {
  if (session.motion.jump !== null) return session;
  if (session.motion.transition !== null) return session;

  const pending = session.coins.find(
    (coin) => coin.status === 'committed' && coin.lane !== session.motion.lane,
  );
  if (pending === undefined) return session;

  const motion = beginLaneChange(session.motion, pending.lane, session.map.motion);
  if (motion === session.motion) return session;

  return { ...session, motion };
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

  /*
   * Momentum drains every step, and the boost events fire on the threshold it
   * crosses rather than on a timer running out. A level has no natural moment
   * of ending; the audio and the scene both want one.
   */
  const momentum = decayMomentum(session.momentum, deltaMs, session.map.boost.durationMs);
  if (session.momentum > BOOSTING_THRESHOLD && momentum <= BOOSTING_THRESHOLD) {
    events.push({ type: 'boostEnded' });
  }

  const advanced: RunSession = {
    ...session,
    elapsedMs: session.elapsedMs + deltaMs,
    playerMeters: session.playerMeters + speed * seconds,
    momentum,
    motion: advanceMotion(session.motion, deltaMs),
    effects: advanceEffects(session.effects, deltaMs),
    // Only time spent with a word on screen counts toward WPM.
    activeTypingMs:
      session.challenge === null ? session.activeTypingMs : session.activeTypingMs + deltaMs,
  };

  // Hazards run after movement, so time-to-impact is measured against where the
  // player actually is this step rather than where they were last step.
  /*
   * Order matters, and this is the pecking order: powerup, hazard, coin.
   *
   * A powerup is due about once a minute and needs a clear road, so it gets
   * first refusal on the next gap — otherwise the hazard scheduler, which is
   * always hungry, takes every gap there is and the crate never appears.
   *
   * Coins come next, for exactly the same reason and a newer one: hazards now
   * follow each other within a fifth of a second, so a coin line that waited its
   * turn behind the spawner never got one. A run went from twenty coin lines to
   * three. Coins ask rarely — every few seconds — and when they ask they go
   * first; the hazard spawner waits for whatever they started.
   */
  const powerupSpawned = spawnDuePowerup(advanced);
  const coinsSpawned = spawnDueCoins(powerupSpawned.session);
  /*
   * A swerve that was refused when it was asked for gets another chance every
   * step. `beginLaneChange` refuses while the player is off the ground, and a
   * coin line answered during flight would otherwise be paid for and never
   * reached.
   */
  const steered = retryCoinSwerve(coinsSpawned.session);
  const powerupLifecycle = advancePowerupLifecycle(steered);
  const coinLifecycle = advanceCoinLifecycle(powerupLifecycle.session);
  // Last, and only into whatever is left: a flow word takes the field when
  // nothing on the road wants it, and never before.
  const flowLifecycle = advanceFlowLifecycle(coinLifecycle.session);

  const current = flowLifecycle.session;
  const allEvents = [
    ...events,
    ...powerupSpawned.events,
    ...powerupLifecycle.events,
    ...coinsSpawned.events,
    ...coinLifecycle.events,
    ...flowLifecycle.events,
  ];

  // A hazard resolved into an impact beat this step; the finish line does not
  // rescue a player who has already hit something.
  if (current.phase !== 'running') return { session: current, events: allEvents };

<<<<<<< Updated upstream
  if (current.playerMeters >= current.map.distanceMeters) {
=======
  /*
   * Caught — checked before the finish line, and after everything that could
   * have moved the gap this step.
   *
   * Before the finish line because a player the chaser has already reached has
   * lost, and crossing on the same step should not launder that into a win. It
   * takes the same impact beat a collision does: the run ending needs a moment
   * the player can see, whichever way it ended.
   */
  if (isCaught(current.pursuit)) {
    /*
     * A shield is what a life is, now that nothing collides.
     *
     * It used to absorb a crash. With the chaser the only way to lose, absorbing
     * being caught is the same promise in the only place left to keep it: the
     * player is thrown clear and the gap is reset to where the run started.
     * Without this a carried shield would be an item with no effect.
     */
    const shielded = spendShield(current.effects);
    if (shielded !== null) {
      const saved: RunSession = {
        ...current,
        effects: shielded,
        pursuit: createPursuit(current.pursuitConfig),
        savedByShield: current.savedByShield + 1,
        assistance: registerFailure(current.assistance, current.assistanceConfig),
      };

      return {
        session: saved,
        events: [...allEvents, { type: 'shieldSpent', remaining: shielded.shields }],
      };
    }

    const caught = toPhase(
      {
        ...current,
        failureReason: 'caught',
        impactRemainingMs: IMPACT_BEAT_MS,
        assistance: registerFailure(current.assistance, current.assistanceConfig),
      },
      'impact',
    );

    return { session: caught.session, events: [...allEvents, ...caught.events] };
  }

  // An endless map has no finish line to cross, so this is the one exit it
  // never takes: the run ends when the player does.
  if (!isEndless(current.map) && current.playerMeters >= current.map.distanceMeters) {
>>>>>>> Stashed changes
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

  const mistyped = typing.incorrectCharacters > session.typing.incorrectCharacters;

  if (!typing.complete) {
    // A mistake breaks the combo the moment it happens. It does not end the run:
    // accuracy is a statistic the progression gates on, and a game that ends on
    // one slip cannot measure it.
    if (!mistyped) return { session: typed, events: [] };

<<<<<<< Updated upstream
    const penalised: RunSession = { ...typed, score: breakCombo(typed.score) };
=======
    const penalised: RunSession = {
      ...typed,
      score: breakCombo(typed.score),
      // The chaser closes on the keystroke, not at the end of the word. That is
      // the point of having something visible back there.
      pursuit: pursuitMistake(typed.pursuit, typed.pursuitConfig),
    };
    const mistake: SessionEvent = {
      type: 'mistyped',
      penalty: DEFAULT_SCORING_CONFIG.incorrectCharacterPenalty,
    };
>>>>>>> Stashed changes

    // The one exception in the whole game: a powerup sentence has to be perfect.
    return typed.challenge?.kind === 'powerup'
      ? forfeitActivePowerup(penalised)
      : { session: penalised, events: [] };
  }

  // Completing it *with* a mistake in the history is still a forfeit — the
  // sentence was not typed cleanly, whatever the final string says.
  if (typed.challenge?.kind === 'powerup' && typed.typing.incorrectCharacters > 0) {
    return forfeitActivePowerup({ ...typed, score: breakCombo(typed.score) });
  }

  const challenge = typed.challenge;
  if (challenge === null) return { session: typed, events: [] };

  if (challenge.kind === 'powerup') return claimActivePowerup(typed, challenge.id);
  if (challenge.kind === 'flow') return completeFlow(typed, challenge.id);

  return commitToCoins(typed, challenge.id);
}

<<<<<<< Updated upstream
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

  /*
   * The word is answered. Whether the *body* moves yet is a separate question.
   *
   * A jump always waits for its moment, or it lands before the obstacle
   * arrives. A lane change waits only if an earlier hazard is still unresolved
   * — leaving that hazard's safe lane early would turn a hazard the player had
   * beaten into a crash. `startDueMoves` picks either of them up.
   */
  const isJump = obstacle.definition.action === 'jump';
  /*
   * A lane change can be *refused*: the motion layer will not steer a player out
   * of a jump, whoever is asking. With hazards this close together the previous
   * hazard's jump is often still in the air when this word is finished, and
   * marking the move as started when it did not start was a `late-move` on a
   * hazard the player answered instantly — the worst failure the game can
   * produce. So the move is only recorded as begun if the body actually moved;
   * otherwise `startDueMoves` picks it up on a later step, once the jump lands.
   */
  const motion = isJump ? session.motion : startAvoidanceMove(session, committed);
  const began = !isJump && motion !== session.motion;
  const moved = began ? startMove(committed) : committed;

  const next: RunSession = {
    ...advanceSecret(session, obstacle.prompt),
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

  const events: SessionEvent[] = [
    { type: 'promptCompleted', prompt: obstacle.prompt, points },
    { type: 'obstacleCommitted', obstacle: moved, move, points },
    { type: 'boostStarted' },
  ];

  /*
   * The word is done, so it comes off the screen now rather than at the
   * collision plane.
   *
   * It used to stay up for the whole of the move — several seconds of a word
   * the player had already finished, which is both a lie about what is being
   * asked of them and the single largest silence in a run. Releasing it here is
   * what lets a gap word fill the tail.
   */
  const cleared = clearPrompt(next);
  events.push(...cleared.events);

  const filled = spawnFlowWord(cleared.session);

  return { session: filled.session, events: [...events, ...filled.events] };
}

/** Starts the lane change the hazard asks for. */
function startAvoidanceMove(session: RunSession, obstacle: ActiveObstacle): PlayerMotion {
  if (obstacle.safeLane === null) return session.motion;

  // Preempt: a coin swerve may be in flight, and a player who typed their way
  // out of a car must never be refused because they were collecting.
  return beginLaneChange(session.motion, obstacle.safeLane, session.map.motion, { preempt: true });
}

=======
>>>>>>> Stashed changes
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
  // A due powerup outranks a coin line. Coins take every gap they are offered,
  // so without this the once-a-minute crate would simply never find room.
  if (session.elapsedMs >= session.nextPowerupAtMs) return { session, events: [] };
  if (session.coins.some(isCoinLive)) return { session, events: [] };
  if (session.powerups.some(isPowerupLive)) return { session, events: [] };
  /*
   * And wait for the body, not just for the road.
   *
   * A hazard is culled the moment it resolves, but the jump it triggered keeps
   * running for the best part of a second afterwards, and `hasLiveHazard` cannot
   * see that. A coin line placed in that window arms its word while the player
   * is still airborne, `beginLaneChange` refuses — a jump cannot be steered out
   * of — and every coin goes by underneath somebody who typed for them.
   */
  if (session.motion.jump !== null) return { session, events: [] };

  const drawn = drawPrompt(session, {
    // Short words only *once the sentence is done*. While it is running the
    // coin word is the next word of the sentence like everything else — a
    // detour the player declines is a word they will be offered again.
    categories: COIN_CATEGORIES,
    usage: 'boost',
  });
  const withPrompt = drawn.session;

  if (drawn.prompt === null) return { session: withPrompt, events: [] };

  const placed = placeCoin({
    instanceId: `coin-${String(session.coins.length + 1)}`,
    prompt: drawn.prompt,
<<<<<<< Updated upstream
    map: session.map,
    playerLane: predictedLane(session),
=======
    map: activeMap(session),
    playerLane: targetLane(session.motion),
>>>>>>> Stashed changes
    playerMeters: session.playerMeters,
    elapsedMs: session.elapsedMs,
    speedMetersPerSecond: placementSpeed(session),
    rng: session.coinRng,
  });

  return {
    session: {
      ...withPrompt,
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
      magnet: hasMagnet(session.effects),
      playerLane: session.motion.lane,
      settled: isSettled(session.motion),
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
        latest = event.coin;
        current = {
          ...current,
          // Every coin in the line went by. Counted here rather than one event
          // per coin, because nothing physical happened to any of them.
          coinsMissed: current.coinsMissed + latest.units.length,
          nextCoinAtMs: current.elapsedMs + current.map.content.coinIntervalSeconds * 1_000,
        };
        current = releaseCoinField(current, latest.instanceId, events);
        continue;
      }

      if (event.type === 'coinUnitReached') {
        // One coin, decided on its own. Scored here rather than at the end of
        // the line so the counter ticks up as the player drives through them,
        // which is the whole point of collecting them one at a time.
        latest = event.coin;
        current = {
          ...current,
          coinsCollected: current.coinsCollected + (event.collected ? 1 : 0),
          coinsMissed: current.coinsMissed + (event.collected ? 0 : 1),
          score: event.collected ? awardCoins(current.score, latest.value) : current.score,
        };

        events.push({
          type: 'coinCollected',
          coin: latest,
          index: event.index,
          collected: event.collected,
          value: event.collected ? latest.value : 0,
        });
        continue;
      }

      // The whole line is behind them.
      latest = event.coin;
      current = {
        ...current,
        // The next line is measured from this one ending, so the rhythm is
        // hazard, gap, coins, gap — rather than a coin clock that drifts.
        nextCoinAtMs: current.elapsedMs + current.map.content.coinIntervalSeconds * 1_000,
      };
      current = releaseCoinField(current, latest.instanceId, events);

      events.push({
        type: 'coinResolved',
        coin: latest,
        collected: coinsTaken(latest) > 0,
        value: coinsTaken(latest) * latest.value,
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

/* -------------------------------------------------------------------------- */
/* Flow words                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Puts a word on screen whenever nothing else has one.
 *
 * No schedule and no interval: the condition is simply "the typing field is
 * free", which is what makes the typing continuous rather than bursty. Called at
 * the end of every step and again the instant a flow word is finished, so the
 * next one is already there.
 *
 * Everything on the road outranks it. A flow word never delays a hazard, a coin
 * line, or a crate — it occupies the moments those are not using, and it yields
 * the field the moment one of them wants it.
 */
function spawnFlowWord(session: RunSession): RunSessionResult {
  if (session.phase !== 'running') return { session, events: [] };
  if (session.challenge !== null) return { session, events: [] };
  // A coin line still owns the field while it is asking. It is the only thing
  // left on the road with a body, and its word is the one that reaches it.
  if (session.coins.some((coin) => coin.status === 'approaching' || coin.status === 'active')) {
    return { session, events: [] };
  }
  if (session.powerups.some(isPowerupLive)) return { session, events: [] };

  /*
   * A gap word used to be allowed only in a *tail* — the stretch after a hazard
   * was answered and before its collision plane arrived — and the reason was
   * real: left free to appear on open road, gap words starved the hazard
   * spawner outright. The field was never clear, so no hazard was ever placed,
   * and a run became a word list with scenery.
   *
   * **That gate is now inverted, and it has to be.** There is no hazard spawner
   * left to starve. A flow word is the default state of the field, and it
   * yields to a coin line or a crate rather than waiting for one to finish.
   * Keeping the old condition would mean a flow word could only appear behind a
   * committed coin line — which happens every eight seconds or so — and the
   * road would be silent for most of a run.
   */
  const drawn = drawPrompt(session, {
    // The map's own vocabulary once the sentence is finished. A filler word that
    // is easier than the map is filler; one from the same source is practice.
    categories: session.map.content.promptCategories,
    usage: 'boost',
  });
  const withPrompt = drawn.session;

  if (drawn.prompt === null) return { session: withPrompt, events: [] };

  const index = session.flowIndex + 1;
  const word = placeFlowWord({
    instanceId: `flow-${String(index)}`,
    prompt: drawn.prompt,
<<<<<<< Updated upstream
    map: session.map,
=======
    map: activeMap(session),
>>>>>>> Stashed changes
    elapsedMs: session.elapsedMs,
  });

  /*
   * There is deliberately no "does it fit" test here.
   *
   * The obvious version of this refused to put up a gap word unless it could be
   * finished before the next hazard was due — and the honest room between two
   * hazards is under a second, so it refused every time and the road went
   * silent for two thirds of the run.
   *
   * It is also unnecessary. Nothing preempts a word any more: the spawner waits
   * for the field the same way it waits for a coin line. A gap word that
   * overruns delays the next hazard by its own remaining budget, and a hazard is
   * placed relative to the player at the moment it spawns, so a delayed hazard
   * is a later hazard, not a closer one. Nothing is eaten.
   */
  return {
    session: {
      ...withPrompt,
      flow: word,
      flowIndex: index,
      prompt: word.prompt,
      typing: createTypingState(word.prompt.text),
      promptStartedMs: session.elapsedMs,
      challenge: { kind: 'flow', id: word.instanceId },
    },
    events: [{ type: 'promptChanged', prompt: word.prompt }],
  };
}

/**
 * Runs the flow word's clock, then makes sure there is one.
 *
 * Expiry costs the combo and nothing else — see `game-core/flow/README.md` for
 * why a filler word must never be able to end a run.
 */
function advanceFlowLifecycle(session: RunSession): RunSessionResult {
  let current = session;
  const events: SessionEvent[] = [];

  const word = current.flow;
  if (word !== null && flowExpired(word, current.elapsedMs)) {
    const missed = expireFlowWord(word);
    current = {
      ...current,
      flow: null,
      flowWordsMissed: current.flowWordsMissed + 1,
      score: breakCombo(current.score),
<<<<<<< Updated upstream
=======
      // The first real cost a lapsed gap word has ever had. Declining a coin
      // line is still free; letting the road go quiet is not.
      pursuit: pursuitFlowMiss(current.pursuit, current.pursuitConfig),
      /*
       * And the one thing adaptive assistance now watches.
       *
       * It used to key off missed hazards, which meant that after the rework it
       * could never fire at all — nothing else was ever registered as a
       * failure. A lapsed word is the failure the game still has.
       */
      assistance: registerFailure(current.assistance, current.assistanceConfig),
>>>>>>> Stashed changes
    };

    events.push({ type: 'flowWordMissed', word: missed });

    if (current.challenge?.kind === 'flow' && current.challenge.id === word.instanceId) {
      const cleared = clearPrompt(current);
      current = cleared.session;
      events.push(...cleared.events);
    }
  }

  const spawned = spawnFlowWord(current);

  return { session: spawned.session, events: [...events, ...spawned.events] };
}

/**
 * Takes the field away from a flow word.
 *
 * Called by everything on the road before it attaches its own prompt. A flow
 * word has no body and no stake, so dropping one is free — it is not "missed",
 * it simply never mattered.
 */
function dropFlowWord(session: RunSession): RunSession {
  return session.flow === null ? session : { ...session, flow: null };
}

/** The word was typed. Pay for it and put the next one up immediately. */
function completeFlow(session: RunSession, instanceId: string): RunSessionResult {
  const word = session.flow;
  if (word === null || word.instanceId !== instanceId || word.status !== 'active') {
    return { session, events: [] };
  }

  const scored = scorePromptCompleted(session.score, {
    correctCharacters: session.typing.correctCharacters,
    incorrectCharacters: session.typing.incorrectCharacters,
    isObstacle: false,
    expectedTypingMs: word.timing.expectedTypingMs,
    actualTypingMs: session.elapsedMs - session.promptStartedMs,
    remainingMs: Math.max(0, word.deadlineAtMs - session.elapsedMs),
  });

  const points = scored.score - session.score.score;
  const finished = completeFlowWord(word);

  const events: SessionEvent[] = [
    { type: 'promptCompleted', prompt: finished.prompt, points },
    { type: 'flowWordCompleted', word: finished, points },
  ];

  /*
   * Speed, though — unlike the score's margin bonus, which a gap word is
   * deliberately denied.
   *
   * The score bonus is for beating something that could have killed you. Speed
   * is for typing, and a player who is typing continuously has to be able to go
   * fast on that alone; there is no longer anything else on the road to earn it
   * from for seconds at a time.
   */
  const margin = marginOf(
    word.timing.availableMs,
    Math.max(0, word.deadlineAtMs - session.elapsedMs),
  );

  let next: RunSession = {
    ...advanceSecret(session, word.prompt),
    flow: null,
    score: scored,
    completedPrompts: session.completedPrompts + 1,
    flowWordsCompleted: session.flowWordsCompleted + 1,
    momentum: earnMomentum(session, margin, events),
    /*
     * And ground. This is the currency hazards used to pay, and with them gone
     * the continuous prompt is the continuous income — otherwise the gap only
     * ever shrinks and every run is a loss on a timer.
     */
    pursuit: pursuitClear(session.pursuit, margin, session.pursuitConfig),
    assistance: registerSuccess(session.assistance, session.assistanceConfig),
  };

  const cleared = clearPrompt(next);
  next = cleared.session;
  events.push(...cleared.events);

  // Straight into the next one. The gap between two flow words is the one gap
  // this feature exists to remove, so it is zero rather than a frame.
  const spawned = spawnFlowWord(next);

  return { session: spawned.session, events: [...events, ...spawned.events] };
}

/* -------------------------------------------------------------------------- */
/* Powerups                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Puts a powerup crate on the road, if the road is clear enough for one.
 *
 * Same courtesy as coins: nothing unresolved, nothing else being collected. A
 * sentence is a long thing to read and it gets the road to itself.
 */
function spawnDuePowerup(session: RunSession): RunSessionResult {
  if (session.elapsedMs < session.nextPowerupAtMs) return { session, events: [] };
  if (session.coins.some(isCoinLive)) return { session, events: [] };
  if (session.powerups.some(isPowerupLive)) return { session, events: [] };
  /*
   * A gap word does *not* hold a crate up.
   *
   * It used to, back when a crate had to wait for a clear road anyway. With a
   * word on screen at essentially all times that condition is never true, and
   * the once-a-minute crate simply stopped appearing. A flow word has no body
   * and costs nothing to drop — see `dropFlowWord` — so the crate takes the
   * field the same way a coin line does.
   */

  // A run of words, not one. That is what makes a powerup a powerup — and while
  // the secret is running they are the *next* run of words, so a crate advances
  // the sentence by a whole clause rather than stepping outside it.
  const drawn = drawPowerupPrompt(session);
  const withPrompt = drawn.session;

  if (drawn.prompt === null) return { session: withPrompt, events: [] };

  const placed = placePowerup({
    instanceId: `powerup-${String(session.powerups.length + 1)}`,
    prompt: drawn.prompt,
<<<<<<< Updated upstream
    map: session.map,
    playerLane: predictedLane(session),
=======
    map: activeMap(session),
    playerLane: targetLane(session.motion),
>>>>>>> Stashed changes
    playerMeters: session.playerMeters,
    elapsedMs: session.elapsedMs,
    speedMetersPerSecond: placementSpeed(session),
    rng: session.powerupRng,
  });

  return {
    session: {
      ...withPrompt,
      powerupRng: placed.rng,
      powerups: [...session.powerups, placed.powerup],
      nextPowerupAtMs: session.elapsedMs + session.map.content.powerupIntervalSeconds * 1_000,
    },
    events: [{ type: 'powerupSpawned', powerup: placed.powerup }],
  };
}

/** Runs every live powerup's clock. Nothing here can end a run either. */
function advancePowerupLifecycle(session: RunSession): RunSessionResult {
  if (session.powerups.length === 0) return { session, events: [] };

  const speed = currentSpeed(session);
  const events: SessionEvent[] = [];
  let current = session;
  const kept: ActivePowerup[] = [];

  for (const powerup of session.powerups) {
    const result = advancePowerup(powerup, {
      playerMeters: session.playerMeters,
      speedMetersPerSecond: speed,
      elapsedMs: session.elapsedMs,
    });

    let latest = result.powerup;

    for (const event of result.events) {
      if (event.type === 'powerupSentenceAttached') {
        const attached = attachPowerupPrompt(current, latest);
        current = attached.session;
        events.push(...attached.events);
        continue;
      }

      if (event.type === 'powerupExpired') {
        current = { ...current, powerupsLost: current.powerupsLost + 1 };
        current = releasePowerupField(current, latest.instanceId, events);
        events.push({ type: 'powerupLost', powerup: latest, reason: 'timeout' });
        continue;
      }

      // Reached the crate. Claiming happened when the sentence was finished;
      // arriving is only where the crate stops being drawn.
      if (latest.status === 'approaching' || latest.status === 'active') {
        latest = { ...latest, status: 'lost' };
      }
    }

    const behind = distanceToPowerup(latest, session.playerMeters) < -COIN_DESPAWN_METERS;
    if (isPowerupLive(latest) || !behind) kept.push(latest);
  }

  return { session: { ...current, powerups: kept }, events };
}

/** Hands the typing field to a powerup crate. Its sentence is optional. */
function attachPowerupPrompt(session: RunSession, powerup: ActivePowerup): RunSessionResult {
  return {
    session: {
      ...dropFlowWord(session),
      prompt: powerup.prompt,
      typing: createTypingState(powerup.prompt.text),
      promptStartedMs: session.elapsedMs,
      challenge: { kind: 'powerup', id: powerup.instanceId },
    },
    events: [
      { type: 'powerupAttached', powerup },
      { type: 'promptChanged', prompt: powerup.prompt },
    ],
  };
}

function releasePowerupField(
  session: RunSession,
  instanceId: string,
  events: SessionEvent[],
): RunSession {
  if (session.challenge?.kind !== 'powerup' || session.challenge.id !== instanceId) return session;

  const cleared = clearPrompt(session);
  events.push(...cleared.events);

  return cleared.session;
}

/**
 * A mistake while typing a sentence. The powerup is gone, immediately.
 *
 * No second chance and no partial credit — that severity is the entire appeal.
 * Nothing else is lost: the run carries on, the combo is already broken by the
 * mistake itself, and the crate simply goes by.
 */
function forfeitActivePowerup(session: RunSession): RunSessionResult {
  const challenge = session.challenge;
  if (challenge?.kind !== 'powerup') return { session, events: [] };

  const powerup = session.powerups.find((entry) => entry.instanceId === challenge.id);
  if (powerup === undefined) return { session, events: [] };

  const lost = forfeitPowerup(powerup);
  const events: SessionEvent[] = [{ type: 'powerupLost', powerup: lost, reason: 'mistake' }];

  let next: RunSession = {
    ...session,
    powerups: session.powerups.map((entry) =>
      entry.instanceId === lost.instanceId ? lost : entry,
    ),
    powerupsLost: session.powerupsLost + 1,
  };
  next = releasePowerupField(next, lost.instanceId, events);

  return { session: next, events };
}

/** The sentence was typed, perfectly. Grant it. */
function claimActivePowerup(session: RunSession, instanceId: string): RunSessionResult {
  const powerup = session.powerups.find((entry) => entry.instanceId === instanceId);
  if (powerup === undefined || powerup.status !== 'active') return { session, events: [] };

  const claimed = claimPowerup(powerup);
  const events: SessionEvent[] = [{ type: 'powerupClaimed', powerup: claimed }];

  const margin = marginOf(
    claimed.timing.availableMs,
    claimed.deadlineAtMs === null ? 0 : Math.max(0, claimed.deadlineAtMs - session.elapsedMs),
  );

  let next: RunSession = {
    ...advanceSecret(session, claimed.prompt),
    powerups: session.powerups.map((entry) => (entry.instanceId === instanceId ? claimed : entry)),
    effects: grantPowerup(session.effects, claimed.kind),
    powerupsClaimed: session.powerupsClaimed + 1,
    completedPrompts: session.completedPrompts + 1,
    momentum: earnMomentum(session, margin, events),
  };
  next = releasePowerupField(next, instanceId, events);

  return { session: next, events };
}

/** The word on a coin line was finished. Start the swerve. */
function commitToCoins(session: RunSession, instanceId: string): RunSessionResult {
  const coin = session.coins.find((entry) => entry.instanceId === instanceId);
  if (coin === undefined || coin.status !== 'active') return { session, events: [] };

  const committed = commitCoin(coin, session.elapsedMs);
  // No preempt. Coins never interrupt a hazard's move, which is the whole
  // reason they are safe to have on the road at all.
  const motion = beginLaneChange(session.motion, committed.lane, session.map.motion);

  const events: SessionEvent[] = [{ type: 'promptCompleted', prompt: coin.prompt, points: 0 }];

  const margin = marginOf(
    coin.timing.availableMs,
    coin.deadlineAtMs === null ? 0 : Math.max(0, coin.deadlineAtMs - session.elapsedMs),
  );

  const next: RunSession = {
    ...advanceSecret(session, coin.prompt),
    coins: session.coins.map((entry) => (entry.instanceId === instanceId ? committed : entry)),
    motion,
    completedPrompts: session.completedPrompts + 1,
    // A coin word is a word. Declining the line still costs nothing; taking it
    // must not pay less than declining it, or the optional pickup is a trap —
    // which is why the ground is paid here and nothing is taken on expiry.
    momentum: earnMomentum(session, margin, events),
    pursuit: pursuitClear(session.pursuit, margin, session.pursuitConfig),
  };

  // Same as a hazard: the word is answered, the swerve is the body's problem,
  // and the screen should not keep asking for something already given.
  const cleared = clearPrompt(next);
  events.push(...cleared.events);

  const filled = spawnFlowWord(cleared.session);

  return { session: filled.session, events: [...events, ...filled.events] };
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
    shields: session.effects.shields,
    flightRemainingMs: session.effects.flightRemainingMs,
    magnetRemainingMs: session.effects.magnetRemainingMs,
    elapsedMs: session.elapsedMs,
    secretWordsTyped: session.secretIndex,
    secretWordCount: session.secretWords.length,
<<<<<<< Updated upstream
=======
    pursuitPressure: pursuitPressure(session.pursuit, session.pursuitConfig),
    // Paced, not the raw config: the endless map raises its own target.
    targetWpm: pacedMap(session).targetWpm,
>>>>>>> Stashed changes
  };
}

/** The powerup crate currently holding the typing field, if any. */
export function activePowerup(session: RunSession): ActivePowerup | null {
  if (session.challenge?.kind !== 'powerup') return null;
  const id = session.challenge.id;

  return session.powerups.find((entry) => entry.instanceId === id) ?? null;
}

/** The flow word currently holding the typing field, if any. */
export function activeFlowWord(session: RunSession): ActiveFlowWord | null {
  if (session.challenge?.kind !== 'flow') return null;

  return session.flow;
}

/** The coin line currently holding the typing field, if any. */
export function activeCoin(session: RunSession): ActiveCoin | null {
  if (session.challenge?.kind !== 'coin') return null;
  const id = session.challenge.id;

  return session.coins.find((entry) => entry.instanceId === id) ?? null;
}

/**
 * Words finished as a fraction of words offered. 1 when none were.
 *
 * Kept under the run result's old `obstacleSuccessRate` name — see the note
 * there. A lapsed flow word is the only miss there is now.
 */
export function promptSuccessRate(session: RunSession): number {
  const offered = session.completedPrompts + session.flowWordsMissed;
  if (offered === 0) return 1;

  return session.completedPrompts / offered;
}

/** Is the player mid-move, and therefore unable to accept another prompt? */
export function isMoving(session: RunSession): boolean {
  return !isSettled(session.motion);
}
