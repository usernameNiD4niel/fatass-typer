export {
  advanceObstacle,
  advanceObstacles,
  distanceToImpact,
  isFair,
  obstaclePressure,
  obstacleProgress,
  placeObstacle,
  remainingMs,
  timeToImpact,
  WARNING_LEAD_FACTOR,
} from './active-obstacle';
export type {
  ActiveObstacle,
  ObstacleAdvanceInput,
  ObstacleAdvanceResult,
  ObstacleEvent,
  ObstacleStatus,
  PlaceObstacleInput,
} from './active-obstacle';
export {
  expireObstacle,
  isResolvable,
  moveForOutcome,
  outcomeForExpiry,
  resolveAvoided,
  STUMBLE_PROGRESS_THRESHOLD,
  typedFraction,
} from './resolution';
export type {
  AvoidanceMove,
  ObstacleOutcome,
  ResolutionResult,
  ResolvedObstacle,
} from './resolution';
export { advanceSpawner, createSpawner, eligibleObstacles, msUntilNextSpawn } from './spawner';
export type { SpawnerInput, SpawnerState, SpawnResult } from './spawner';
