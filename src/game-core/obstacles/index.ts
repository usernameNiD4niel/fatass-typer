export {
  advanceObstacle,
  advanceObstacles,
  blocksLane,
  commitObstacle,
  moveIsDue,
  startMove,
  distanceToImpact,
  isFair,
  obstaclePressure,
  obstacleProgress,
  placeObstacle,
  remainingMs,
  reserveMsFor,
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
export { assignLanes, isValidArrangement } from './lane-assignment';
export type { LaneAssignment, LaneAssignmentInput, LaneAssignmentResult } from './lane-assignment';
export {
  clearsHazard,
  expireObstacle,
  isResolvable,
  moveForOutcome,
  resolveAtImpact,
  typedFraction,
} from './resolution';
export type {
  AvoidanceMove,
  FailureReason,
  ImpactInput,
  ObstacleOutcome,
  ResolutionResult,
  ResolvedObstacle,
} from './resolution';
export {
  advanceSpawner,
  beginRecovery,
  createSpawner,
  eligibleObstacles,
  msUntilNextSpawn,
} from './spawner';
export type { SpawnerInput, SpawnerState, SpawnResult } from './spawner';
