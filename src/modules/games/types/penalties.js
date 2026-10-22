import { z } from 'zod';

/*
 * PENALTY SHOOTOUT (football) — five kicks against the keeper.
 * For each kick the player picks a direction (left / centre / right) and height (low / high).
 * The keeper's dives and the "luck" of each kick are drawn from the session seed on the
 * SERVER when the game starts and are never sent to the player, so a shootout can't be
 * gamed by reading the network. A duel = both players face the same keeper.
 *   same direction + low  → saved
 *   same direction + high → 50% chance the keeper tips it over
 *   other direction + high → 15% chance it flies over the bar
 *   other direction + low → goal
 */
const KICKS = 5;
const DIRECTIONS = ['left', 'centre', 'right'];

export default {
  key: 'penalties',
  name: 'Penalty shootout',
  sport: 'Football',
  implemented: true,
  modes: ['solo', 'duel', 'competition'],
  scope:
    'Five penalties against a keeper. Pick where to shoot — high is harder to save but can miss.',
  timeLimitSeconds: 180,
  answerSchema: z
    .object({
      kicks: z
        .array(
          z.object({ direction: z.enum(DIRECTIONS), height: z.enum(['low', 'high']) }).strict(),
        )
        .length(KICKS),
    })
    .strict(),

  create(rand) {
    const keeper = Array.from({ length: KICKS }, () => ({
      dive: DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)],
      luck: rand(),
    }));
    return {
      secret: { keeper },
      view: { kicks: KICKS, directions: DIRECTIONS, heights: ['low', 'high'] },
      timeLimitSeconds: 180,
    };
  },

  score({ secret, answer }) {
    const details = answer.kicks.map((kick, i) => {
      const { dive, luck } = secret.keeper[i];
      let outcome;
      if (kick.direction === dive) outcome = kick.height === 'low' || luck < 0.5 ? 'saved' : 'goal';
      else outcome = kick.height === 'high' && luck < 0.15 ? 'over' : 'goal';
      return { kick: i + 1, ...kick, keeper: dive, outcome, correct: outcome === 'goal' };
    });
    const goals = details.filter((d) => d.outcome === 'goal').length;
    return { score: goals, max: KICKS, perfect: goals === KICKS, goals, details };
  },
};
