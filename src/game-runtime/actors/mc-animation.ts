/**
 * The MC's animation state machine (spec §5, §10).
 *
 * Presentation only. It reports what the character *looks* like doing; it never
 * decides what happens. The rules in `game-core` say the MC was hit, and this
 * says the hit pose lasts 800ms.
 *
 * The critical rule from CLAUDE.md §5: **world speed drives animation, never the
 * other way round.** The run cycle advances by distance travelled, so a boost
 * makes the legs move faster because the MC is moving faster — the animation has
 * no say in how fast the world scrolls.
 */

export const MC_ANIMATION_STATES = [
  'idle',
  'running',
  'boosting',
  'jumping',
  'sliding',
  'sidestepping',
  'stumbling',
  'hit',
  'victory',
  'caught',
] as const;

export type McAnimationState = (typeof MC_ANIMATION_STATES)[number];

/** The three states that describe ordinary movement, chosen from speed alone. */
export type McLocomotionState = Extract<McAnimationState, 'idle' | 'running' | 'boosting'>;

/**
 * States that play once and hand back to locomotion, with their durations in
 * milliseconds.
 *
 * The avoidance moves are timed to read clearly at a glance rather than to match
 * any physics: an obstacle is resolved the instant the prompt is completed, and
 * the jump is the feedback for that, not the mechanism.
 */
const TRANSIENT_DURATIONS_MS = {
  jumping: 700,
  sliding: 600,
  sidestepping: 500,
  stumbling: 500,
  hit: 800,
} as const satisfies Partial<Record<McAnimationState, number>>;

type TransientState = keyof typeof TRANSIENT_DURATIONS_MS;

/** States the run cannot come back from. They hold their final pose. */
const TERMINAL_STATES = new Set<McAnimationState>(['victory', 'caught']);

/**
 * Interrupt priority. A higher number wins.
 *
 * A collision must be able to cut a jump short — the player needs to see the
 * thing that just cost them meters, not a jump animation playing over it. The
 * reverse would let a cosmetic move hide a consequence.
 */
const PRIORITY: Readonly<Record<McAnimationState, number>> = {
  idle: 0,
  running: 0,
  boosting: 0,
  jumping: 1,
  sliding: 1,
  sidestepping: 1,
  stumbling: 2,
  hit: 3,
  victory: 4,
  caught: 4,
};

export interface McAnimation {
  readonly state: McAnimationState;
  /** Time spent in the current state, in milliseconds. */
  readonly elapsedMs: number;
  /**
   * Progress through the current one-shot, 0..1. Always 0 for locomotion and 1
   * for terminal states, so renderers can read it without a state check.
   */
  readonly progress: number;
  /**
   * Position in the looping run cycle, 0..1. Advances with distance travelled,
   * and keeps running underneath a one-shot so the legs do not reset on landing.
   */
  readonly cyclePhase: number;
  /** What to return to when the current one-shot finishes. */
  readonly locomotion: McLocomotionState;
}

export function createMcAnimation(): McAnimation {
  return { state: 'idle', elapsedMs: 0, progress: 0, cyclePhase: 0, locomotion: 'idle' };
}

export function isTerminal(animation: McAnimation): boolean {
  return TERMINAL_STATES.has(animation.state);
}

function isTransient(state: McAnimationState): state is TransientState {
  return state in TRANSIENT_DURATIONS_MS;
}

/** Duration of a one-shot state, or 0 for states that do not end on their own. */
export function stateDurationMs(state: McAnimationState): number {
  return isTransient(state) ? TRANSIENT_DURATIONS_MS[state] : 0;
}

/** Meters covered by one full stride cycle. Sets how the legs read against speed. */
const STRIDE_METERS = 2.2;

/** Seconds for one idle breathing cycle, used when the MC is not moving. */
const IDLE_CYCLE_SECONDS = 1.4;

/**
 * Chooses the locomotion state from what the rules report.
 *
 * `boosting` is not "fast" — it is the state the boost profile put the MC in.
 * Deriving it from a speed threshold would light up the boost pose on a map
 * whose base speed happens to be high.
 */
export function locomotionFor(speedMetersPerSecond: number, boosting: boolean): McLocomotionState {
  if (boosting) return 'boosting';

  return speedMetersPerSecond > 0.01 ? 'running' : 'idle';
}

/** Updates the locomotion the MC returns to, without disturbing a one-shot. */
export function setLocomotion(animation: McAnimation, locomotion: McLocomotionState): McAnimation {
  if (animation.locomotion === locomotion) return animation;
  if (isTerminal(animation)) return { ...animation, locomotion };

  // Mid-one-shot the change is queued rather than applied: interrupting a jump
  // because a boost expired would look like a glitch.
  if (isTransient(animation.state)) return { ...animation, locomotion };

  return { ...animation, state: locomotion, locomotion, elapsedMs: 0, progress: 0 };
}

/**
 * Requests a state change. Returns the animation unchanged when the request
 * loses on priority, so callers never need to know what is currently playing.
 */
export function play(animation: McAnimation, state: McAnimationState): McAnimation {
  if (isTerminal(animation)) return animation;
  if (PRIORITY[state] < PRIORITY[animation.state]) return animation;

  const locomotion: McLocomotionState =
    state === 'idle' || state === 'running' || state === 'boosting' ? state : animation.locomotion;

  return {
    ...animation,
    state,
    locomotion,
    elapsedMs: 0,
    progress: TERMINAL_STATES.has(state) ? 1 : 0,
  };
}

export interface AdvanceInput {
  readonly deltaMs: number;
  /** The MC's current speed, from the rules. Drives the run cycle. */
  readonly speedMetersPerSecond: number;
}

/**
 * Advances by one frame.
 *
 * Takes real elapsed time rather than a fixed step: this is called from the
 * render pass, not the simulation step, so it must cope with any frame length.
 */
export function advanceMcAnimation(animation: McAnimation, input: AdvanceInput): McAnimation {
  const deltaMs = Math.max(0, input.deltaMs);
  const seconds = deltaMs / 1000;

  // Distance-driven while moving, clock-driven while standing still. A stopped
  // MC still needs to breathe, and dividing by a zero stride would not work.
  const cycleAdvance =
    input.speedMetersPerSecond > 0.01
      ? (input.speedMetersPerSecond * seconds) / STRIDE_METERS
      : seconds / IDLE_CYCLE_SECONDS;

  const cyclePhase = (animation.cyclePhase + cycleAdvance) % 1;
  const elapsedMs = animation.elapsedMs + deltaMs;

  if (isTerminal(animation)) {
    return { ...animation, elapsedMs, cyclePhase, progress: 1 };
  }

  if (!isTransient(animation.state)) {
    return { ...animation, elapsedMs, cyclePhase, progress: 0 };
  }

  const duration = TRANSIENT_DURATIONS_MS[animation.state];

  if (elapsedMs >= duration) {
    // Overshoot is dropped rather than carried into the next state: a 100ms
    // frame should not start the run cycle 100ms "late".
    return {
      ...animation,
      state: animation.locomotion,
      elapsedMs: 0,
      progress: 0,
      cyclePhase,
    };
  }

  return { ...animation, elapsedMs, cyclePhase, progress: elapsedMs / duration };
}

/**
 * Height off the ground, 0..1, for states that leave it.
 *
 * A sine arc — exaggerated and readable at small scale, which spec §10 asks for,
 * and cheaper than a physics simulation nobody would be able to tell apart.
 */
export function verticalOffsetRatio(animation: McAnimation): number {
  if (animation.state !== 'jumping') return 0;

  return Math.sin(animation.progress * Math.PI);
}

/**
 * The animation for an avoidance move (spec §5).
 *
 * `game-core` decides *what* happened — the obstacle's action, or a stumble, or
 * an impact — and this maps it onto a pose. Keeping the mapping here is what
 * lets the rules stay ignorant of animation entirely.
 */
export function animationForMove(
  move: 'jump' | 'slide' | 'sidestep' | 'stumble' | 'impact',
): McAnimationState {
  switch (move) {
    case 'jump':
      return 'jumping';
    case 'slide':
      return 'sliding';
    case 'sidestep':
      return 'sidestepping';
    case 'stumble':
      return 'stumbling';
    case 'impact':
      return 'hit';
  }
}

/**
 * Lateral shift, -1..1, for a sidestep. Positive is away from the camera.
 *
 * The sidestep needs its own pose rather than borrowing the slide's: the player
 * has to be able to tell which move the game just credited them with, or the
 * feedback stops teaching them anything.
 */
export function lateralOffsetRatio(animation: McAnimation): number {
  if (animation.state !== 'sidestepping') return 0;

  return Math.sin(animation.progress * Math.PI);
}

/** How low the MC is crouching, 0..1. Full during the middle of a slide. */
export function crouchRatio(animation: McAnimation): number {
  if (animation.state !== 'sliding') return 0;

  // Quick drop, held, quick recovery — the shape a slide reads as.
  return Math.min(1, Math.sin(animation.progress * Math.PI) * 1.6);
}
