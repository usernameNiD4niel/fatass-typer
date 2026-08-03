import { describe, it } from 'vitest';
import { ALL_PROMPTS, MAPS, OBSTACLES } from '../../content';
import { advanceRunSession, applyRunInput, createRunSession, startRun, isBoosting } from './run-session';

describe('tune', () => {
  it('traces map-4 threshold with errors', () => {
    const map = MAPS[3];
    if (map === undefined) throw new Error();
    let session = startRun(createRunSession({ map, pool: ALL_PROMPTS, obstacles: OBSTACLES, seed: 'threshold' })).session;
    const interval = 60_000 / (map.targetWpm * 5);
    let nextKey = 0;
    let keystroke = 0;
    let pending = false;
    let last = '';
    for (let step = 0; step < 6000 && session.phase === 'running'; step += 1) {
      while (session.elapsedMs >= nextKey && session.phase === 'running') {
        const target = session.prompt?.text ?? '';
        const typed = session.typing.typed;
        if (pending) {
          session = applyRunInput(session, typed.slice(0, -1)).session;
          pending = false;
        } else if (typed.length < target.length) {
          keystroke += 1;
          if (keystroke % 12 === 0) {
            session = applyRunInput(session, typed + (target[typed.length] === 'x' ? 'q' : 'x')).session;
            pending = true;
          } else {
            session = applyRunInput(session, target.slice(0, typed.length + 1)).session;
          }
        }
        nextKey += interval;
      }
      session = advanceRunSession(session, 16).session;
      const text = session.prompt?.text ?? '(none)';
      if (text !== last) {
        last = text;
        console.log(`t=${(session.elapsedMs / 1000).toFixed(1)} gap=${session.chase.distanceMeters.toFixed(1)} boost=${String(isBoosting(session))} obstacles=${String(session.obstacles.length)} prompt="${text}"`);
      }
    }
    console.log(`END phase=${session.phase} m=${session.playerMeters.toFixed(0)}/${String(map.distanceMeters)} faced=${String(session.obstaclesFaced)} avoided=${String(session.obstaclesAvoided)} stumbles=${String(session.stumbles)} collisions=${String(session.collisions)}`);
  });
});
