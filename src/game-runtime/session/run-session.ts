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
  RivalStanding,
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
  penaliseMomentum,
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
import { advanceRace, createRace, playerPlacement, type RaceState } from '../../game-core/race';
import {
  type ActiveSurge,
  breakSurge,
  completeSurge,
  FIRST_SURGE_AT_MS,
  pickSurge,
  placeSurge,
  racerSurgeShare,
  SURGE_COMPLETE_MOMENTUM,
  SURGE_INTERVAL_MS,
  SURGE_MOMENTUM,
  SURGE_REWARD_MS,
  surgeExpired,
} from '../../game-core/surge';
import {
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
import { createRngFromString, type Rng } from '../../game-core/random';
import {
  awardCoins,
  breakCombo,
  createScoreState,
  DEFAULT_SCORING_CONFIG,
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
  readonly kind: 'coin' | 'powerup' | 'flow' | 'surge';
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
  /**
   * The two opponents (`game-core/race`).
   *
   * They do not type and cannot be collided with. What they do is finish before
   * or after the player, and take coins the player was slower to reach.
   */
  readonly race: RaceState;
  /**
   * The long sentence, while one is running (`game-core/surge`).
   *
   * The catch-up mechanic: everybody gets one a minute, and what the player
   * gets out of theirs depends on holding it together.
   */
  readonly surge: ActiveSurge | null;
  /** Run time the next surge is due. */
  readonly nextSurgeAtMs: number;
  /** Sentences a surge may draw from. Empty means a run with no surges. */
  readonly surgePool: readonly PromptEntry[];
  /** Run time the completion reward stops paying, or 0. */
  readonly surgeRewardUntilMs: number;
  /** Surges finished clean, for the results screen. */
  readonly surgesCompleted: number;
  /** Surges lost to a wrong character. */
  readonly surgesBroken: number;
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
  /** Coins a rival reached first. Missed, but not by the player's own doing. */
  readonly coinsStolen: number;
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
  /**
   * A wrong character was typed.
   *
   * Carries the points it will cost so the scene can say so at the moment it
   * happens. The charge is real but deferred — `scorePrompt` subtracts it when
   * the prompt is finished — and a penalty the player is told about three
   * seconds after the keystroke that caused it teaches nothing.
   */
  | { readonly type: 'mistyped'; readonly penalty: number }
  | { readonly type: 'boostStarted' }
  | { readonly type: 'boostEnded' }
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
      readonly type: 'coinStolen';
      readonly coin: ActiveCoin;
      readonly index: number;
      readonly by: string;
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
  | { readonly type: 'surgeStarted'; readonly surge: ActiveSurge }
  | {
      readonly type: 'surgeEnded';
      readonly surge: ActiveSurge;
      /** Finished the whole sentence, rather than lapsing or slipping. */
      readonly completed: boolean;
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
  /**
   * Long sentences for the surge (`content/surges.ts`).
   *
   * Passed in rather than imported, like every other piece of content: the
   * rules do not know what the game is about.
   */
  readonly surges?: readonly PromptEntry[];
  /** Adaptive assistance. Pass `{ ...config, enabled: false }` to turn it off. */
  readonly assistance?: AdaptiveAssistanceConfig;
  /**
   * Characters the player fumbles, from their profile (plan 2.4).
   *
   * Passed in rather than derived from `keyStats` as the run goes: the words
   * the run practises should be chosen from what the player is known to be bad
   * at, not from the handful of mistakes they have made in the last thirty
   * seconds. Lifetime evidence, decided once, at the start.
   */
  readonly weakCharacters?: readonly string[];
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
    momentum: 0,
    keyStats: EMPTY_KEY_STATS,
    weakCharacters: input.weakCharacters ?? [],
    pursuit: createPursuit(pursuitConfigFor(input.map)),
    pursuitConfig: pursuitConfigFor(input.map),
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
    race: createRace(input.map, createRngFromString(`${input.seed}:race`)),
    surge: null,
    nextSurgeAtMs: FIRST_SURGE_AT_MS,
    surgePool: input.surges ?? [],
    surgeRewardUntilMs: 0,
    surgesCompleted: 0,
    surgesBroken: 0,
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
    coinsStolen: 0,
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

  return ramped * momentumMultiplier(surgedMomentum(session), session.map.boost.speedMultiplier);
}

/**
 * Momentum, with a surge's floor applied.
 *
 * A surge does not *add* speed — it holds momentum up while it runs, and holds
 * it at full for a while after it is finished. Adding would let a player bank a
 * surge on top of already-perfect typing and exceed the ceiling every deadline
 * in the game is placed against.
 */
export function surgedMomentum(session: RunSession): number {
  if (session.elapsedMs < session.surgeRewardUntilMs) {
    return Math.max(session.momentum, SURGE_COMPLETE_MOMENTUM);
  }

  const surge = session.surge;
  if (surge === null || surge.status !== 'active') return session.momentum;

  /*
   * Scaled by how far into the sentence the player has got, and that is the
   * whole of the rule.
   *
   * Paying a flat boost for a surge merely being *on screen* was tried and it
   * handed free speed to somebody typing nothing at all — a player who never
   * touched the keyboard finished the map on surges alone. What the surge pays
   * for is holding the sentence together, so the payment has to track how much
   * of it is being held.
   */
  const target = surge.prompt.text.length;
  const progress = target === 0 ? 0 : Math.min(1, session.typing.correctCharacters / target);

  return Math.max(session.momentum, SURGE_MOMENTUM * progress);
}

/** True while a surge is carrying the player, for the HUD and the scene. */
export function isSurging(session: RunSession): boolean {
  return (
    session.elapsedMs < session.surgeRewardUntilMs ||
    (session.surge !== null && session.surge.status === 'active')
  );
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
  // Endless: there is no proportion of the way there, because there is no
  // there. The HUD shows distance instead — see `isEndless`.
  if (session.map.distanceMeters <= 0) return 0;

  return Math.min(1, session.playerMeters / session.map.distanceMeters);
}

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
    // The run quietly practises what the player is bad at (plan 2.4).
    weakCharacters: session.weakCharacters,
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
    // The opponents run on the same clock. They are not driven by the player
    // and nothing they do can end the run — see `game-core/race`.
    race: advanceRace(session.race, {
      map: session.map,
      deltaMs,
      elapsedMs: session.elapsedMs,
      distanceMeters: session.map.distanceMeters,
    }),
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
  /*
   * The surge goes first when one is due.
   *
   * It is the only thing in the game on a fixed clock that everybody gets, so
   * letting a crate or a coin line push it a few seconds later every minute
   * would slowly drift it out of step with the racers' own surge — and the two
   * halves of the mechanic have to land together.
   */
  const surgeSpawned = spawnDueSurge(advanced);
  const powerupSpawned = spawnDuePowerup(surgeSpawned.session);
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
  const surgeLifecycle = advanceSurgeLifecycle(coinLifecycle.session);
  const flowLifecycle = advanceFlowLifecycle(surgeLifecycle.session);

  const current = flowLifecycle.session;
  const allEvents = [
    ...events,
    ...surgeSpawned.events,
    ...powerupSpawned.events,
    ...surgeLifecycle.events,
    ...powerupLifecycle.events,
    ...coinsSpawned.events,
    ...coinLifecycle.events,
    ...flowLifecycle.events,
  ];

  // A hazard resolved into an impact beat this step; the finish line does not
  // rescue a player who has already hit something.
  if (current.phase !== 'running') return { session: current, events: allEvents };

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
  const typed: RunSession = {
    ...session,
    typing,
    stats,
    // Every keystroke, right or wrong. Accuracy says how much went wrong; this
    // is the only thing that says *what*.
    keyStats: recordAttempts(session.keyStats, typing.lastAttempts),
  };

  const mistyped = typing.incorrectCharacters > session.typing.incorrectCharacters;

  if (!typing.complete) {
    // A mistake breaks the combo the moment it happens. It does not end the run:
    // accuracy is a statistic the progression gates on, and a game that ends on
    // one slip cannot measure it.
    if (!mistyped) return { session: typed, events: [] };

    const penalised: RunSession = {
      ...typed,
      score: breakCombo(typed.score),
      // The chaser closes on the keystroke, not at the end of the word. That is
      // the point of having something visible back there.
      pursuit: pursuitMistake(typed.pursuit, typed.pursuitConfig),
      // And the player loses a little speed with it, so a mistake is felt in
      // the road as well as in the numbers.
      momentum: penaliseMomentum(typed.momentum),
    };
    const mistake: SessionEvent = {
      type: 'mistyped',
      penalty: DEFAULT_SCORING_CONFIG.incorrectCharacterPenalty,
    };

    // The one exception in the whole game: a powerup sentence has to be perfect.
    if (typed.challenge?.kind === 'powerup') {
      const forfeited = forfeitActivePowerup(penalised);

      return { session: forfeited.session, events: [mistake, ...forfeited.events] };
    }

    // And a surge, which is the same bargain over four times the length.
    if (typed.challenge?.kind === 'surge') {
      const stopped = breakActiveSurge(penalised);

      return { session: stopped.session, events: [mistake, ...stopped.events] };
    }

    return { session: penalised, events: [mistake] };
  }

  // Completing it *with* a mistake in the history is still a forfeit — the
  // sentence was not typed cleanly, whatever the final string says.
  if (typed.challenge?.kind === 'powerup' && typed.typing.incorrectCharacters > 0) {
    return forfeitActivePowerup({ ...typed, score: breakCombo(typed.score) });
  }

  if (typed.challenge?.kind === 'surge' && typed.typing.incorrectCharacters > 0) {
    return breakActiveSurge({ ...typed, score: breakCombo(typed.score) });
  }

  const challenge = typed.challenge;
  if (challenge === null) return { session: typed, events: [] };

  if (challenge.kind === 'powerup') return claimActivePowerup(typed, challenge.id);
  if (challenge.kind === 'surge') return completeActiveSurge(typed, challenge.id);
  if (challenge.kind === 'flow') return completeFlow(typed, challenge.id);

  return commitToCoins(typed, challenge.id);
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
    map: activeMap(session),
    playerLane: targetLane(session.motion),
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
      // Whoever is in front gets there first.
      rivals: session.race.racers.map((racer) => ({
        id: racer.id,
        name: racer.name,
        meters: racer.meters,
      })),
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

      if (event.type === 'coinUnitStolen') {
        /*
         * Gone, and not to the player. Counted apart from `coinsMissed`
         * because the two mean different things to a player reading their
         * results: one is a coin they declined, the other is a coin they were
         * beaten to.
         */
        latest = event.coin;
        current = { ...current, coinsStolen: current.coinsStolen + 1 };

        events.push({ type: 'coinStolen', coin: latest, index: event.index, by: event.by });
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
/* Surges                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Puts the long sentence up, when one is due and the road will allow it.
 *
 * It outranks a flow word — which costs nothing to drop — and waits for
 * anything with a body. A surge arriving in the middle of a coin swerve would
 * mean choosing between the coins already paid for and the sentence, which is
 * not a choice anybody can make in the half second available.
 */
function spawnDueSurge(session: RunSession): RunSessionResult {
  if (session.elapsedMs < session.nextSurgeAtMs) return { session, events: [] };
  if (session.surgePool.length === 0) return { session, events: [] };
  if (session.surge !== null) return { session, events: [] };
  if (session.coins.some(isCoinLive)) return { session, events: [] };
  if (session.powerups.some(isPowerupLive)) return { session, events: [] };

  const index = session.surgesCompleted + session.surgesBroken;
  // Long *for this map*: a twelve-word sentence on a 20 WPM map cannot be
  // finished inside the cap, and an unfinishable reward is a punishment.
  const prompt = pickSurge(session.surgePool, activeMap(session), index);
  if (prompt === undefined) return { session, events: [] };

  const surge = placeSurge({
    instanceId: `surge-${String(index + 1)}`,
    prompt,
    map: activeMap(session),
    elapsedMs: session.elapsedMs,
  });

  /*
   * Every racer surges at the same moment, weighted to whoever is behind.
   *
   * This is the half of the mechanic the player never sees directly, and it is
   * why the race stays close: a surge only the player got would turn a catch-up
   * tool into a way for a strong typist to leave the field for good.
   */
  const boosted = surgeRacers(session);

  return {
    session: {
      ...dropFlowWord({ ...session, race: boosted }),
      surge,
      nextSurgeAtMs: session.elapsedMs + SURGE_INTERVAL_MS,
      prompt: surge.prompt,
      typing: createTypingState(surge.prompt.text),
      promptStartedMs: session.elapsedMs,
      challenge: { kind: 'surge', id: surge.instanceId },
    },
    events: [
      { type: 'surgeStarted', surge },
      { type: 'promptChanged', prompt: surge.prompt },
    ],
  };
}

/** Moves every racer forward by their share of a surge. */
function surgeRacers(session: RunSession): RaceState {
  return {
    ...session.race,
    racers: session.race.racers.map((racer) => ({
      ...racer,
      // A one-off shove rather than a speed change, so it cannot compound with
      // the pace they are already drifting toward.
      meters:
        racer.meters + SURGE_RACER_METERS * racerSurgeShare(session.playerMeters - racer.meters),
    })),
  };
}

/**
 * How far a full racer surge is worth, in metres.
 *
 * Sized against the gap a race is actually decided by rather than against the
 * player's own surge: what the player gets is time at a higher speed, and
 * converting that into an equivalent shove would tie two dials together that
 * want to be tuned apart.
 */
const SURGE_RACER_METERS = 18;

/** Runs the surge's clock. Lapsing costs the sentence and nothing else. */
function advanceSurgeLifecycle(session: RunSession): RunSessionResult {
  const surge = session.surge;
  if (surge === null) return { session, events: [] };

  if (surge.status !== 'active') {
    return { session: { ...session, surge: null }, events: [] };
  }

  if (!surgeExpired(surge, session.elapsedMs)) return { session, events: [] };

  const events: SessionEvent[] = [{ type: 'surgeEnded', surge, completed: false }];
  let next: RunSession = {
    ...session,
    surge: null,
    surgesBroken: session.surgesBroken + 1,
    /*
     * A lapsed surge costs ground, exactly as a lapsed gap word does.
     *
     * Without this, a surge was a free pass: it holds the field, so no gap word
     * is on screen, so a player who typed nothing for its whole length was
     * never penalised for the silence. The road going quiet costs the same
     * whichever prompt was supposed to be filling it.
     */
    pursuit: pursuitFlowMiss(session.pursuit, session.pursuitConfig),
  };

  if (next.challenge?.kind === 'surge' && next.challenge.id === surge.instanceId) {
    const cleared = clearPrompt(next);
    next = cleared.session;
    events.push(...cleared.events);
  }

  const filled = spawnFlowWord(next);

  return { session: filled.session, events: [...events, ...filled.events] };
}

/** One wrong character. The sentence goes, and the speed with it. */
function breakActiveSurge(session: RunSession): RunSessionResult {
  const surge = session.surge;
  if (surge === null || surge.status !== 'active') return { session, events: [] };

  const broken = breakSurge(surge);
  const events: SessionEvent[] = [{ type: 'surgeEnded', surge: broken, completed: false }];

  let next: RunSession = {
    ...session,
    surge: null,
    surgesBroken: session.surgesBroken + 1,
    // The reward stops too. A surge that kept paying after it was broken would
    // make breaking one on the last word the best way to play it.
    surgeRewardUntilMs: 0,
  };

  if (next.challenge?.kind === 'surge' && next.challenge.id === surge.instanceId) {
    const cleared = clearPrompt(next);
    next = cleared.session;
    events.push(...cleared.events);
  }

  const filled = spawnFlowWord(next);

  return { session: filled.session, events: [...events, ...filled.events] };
}

/** The whole sentence, clean. Full pace, held. */
function completeActiveSurge(session: RunSession, instanceId: string): RunSessionResult {
  const surge = session.surge;
  if (surge === null || surge.instanceId !== instanceId || surge.status !== 'active') {
    return { session, events: [] };
  }

  const finished = completeSurge(surge);
  const scored = scorePromptCompleted(session.score, {
    correctCharacters: session.typing.correctCharacters,
    incorrectCharacters: 0,
    isObstacle: false,
    expectedTypingMs: surge.timing.expectedTypingMs,
    actualTypingMs: session.elapsedMs - session.promptStartedMs,
    remainingMs: Math.max(0, surge.deadlineAtMs - session.elapsedMs),
    marginFraction: 0,
  });

  const points = scored.score - session.score.score;
  const events: SessionEvent[] = [
    { type: 'promptCompleted', prompt: finished.prompt, points },
    { type: 'surgeEnded', surge: finished, completed: true },
  ];

  let next: RunSession = {
    ...session,
    surge: null,
    score: scored,
    completedPrompts: session.completedPrompts + 1,
    surgesCompleted: session.surgesCompleted + 1,
    surgeRewardUntilMs: session.elapsedMs + SURGE_REWARD_MS,
    momentum: earnMomentum(session, 1, events),
    // A whole sentence held together is the strongest thing the player can do
    // to the chaser, and it should feel like it.
    pursuit: pursuitClear(session.pursuit, 1, session.pursuitConfig),
  };

  const cleared = clearPrompt(next);
  next = cleared.session;
  events.push(...cleared.events);

  const filled = spawnFlowWord(next);

  return { session: filled.session, events: [...events, ...filled.events] };
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
  // A surge owns the field outright while it runs: it is the longest and most
  // valuable thing the game ever puts on screen.
  if (session.surge !== null && session.surge.status === 'active') {
    return { session, events: [] };
  }

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
    map: activeMap(session),
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
    /*
     * No margin bonus for a gap word, deliberately.
     *
     * It is the largest single term on offer, and a gap word costs nothing to
     * miss. Paying it here would hand the biggest reward in the game to the one
     * prompt with no stake — which is the exact complaint the density work was
     * fixing. The margin bonus is for beating something that could have killed
     * you.
     */
    marginFraction: 0,
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
    map: activeMap(session),
    playerLane: targetLane(session.motion),
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
    distanceMeters: session.playerMeters,
    secretWordsTyped: session.secretIndex,
    secretWordCount: session.secretWords.length,
    pursuitPressure: pursuitPressure(session.pursuit, session.pursuitConfig),
    // Paced, not the raw config: the endless map raises its own target.
    targetWpm: pacedMap(session).targetWpm,
    placement: playerPlacement(session.race, session.playerMeters),
    rivals: rivalStandings(session),
  };
}

/**
 * Where each opponent is, by the side of the road they run on.
 *
 * Both of them, rather than only the nearest. The nearest one is the one the
 * standing is about to change on, but a player watching a rival on their left
 * wants to know about *that* rival — and with two of them in fixed lanes, the
 * side is the name the player already has for them.
 *
 * Signed from the player: negative means behind. See `RivalStanding`.
 */
export function rivalStandings(session: RunSession): readonly RivalStanding[] {
  return (
    session.race.racers
      .map((racer) => ({
        side: racer.lane < CENTRE_LANE ? ('left' as const) : ('right' as const),
        gapMeters: racer.meters - session.playerMeters,
      }))
      // Left before right, always. The HUD reads left to right and a pair of
      // readouts that swap places between runs is a pair nobody can glance at.
      .sort((left, right) => (left.side === right.side ? 0 : left.side === 'left' ? -1 : 1))
  );
}

/** The powerup crate currently holding the typing field, if any. */
export function activePowerup(session: RunSession): ActivePowerup | null {
  if (session.challenge?.kind !== 'powerup') return null;
  const id = session.challenge.id;

  return session.powerups.find((entry) => entry.instanceId === id) ?? null;
}

/** The surge currently holding the typing field, if any. */
export function activeSurge(session: RunSession): ActiveSurge | null {
  if (session.challenge?.kind !== 'surge') return null;

  return session.surge;
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
