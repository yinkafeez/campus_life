import quiz from './quiz.js';
import ordering from './ordering.js';
import matching from './matching.js';
import scenario from './scenario.js';
import written from './written.js';

/*
 * ACTIVITY ENGINES — the reusable mechanics behind every game activity.
 *
 * An activity (data, imported from a learning pack) names an engine and carries content
 * in that engine's shape. Departments don't get separate games: a Law moot court, an
 * Engineering practical and a Medicine clinical case are all content for these engines.
 *
 * Engine contract:
 *   key, label
 *   contentSchema   zod — validates the activity content on import
 *   answerSchema    zod — validates a player's submission
 *   present(content, rand) → { view, secret }   what the player sees (NO answers) + a
 *                                               per-attempt secret kept on the server
 *   score(content, answer, secret) → { score, max, feedback, ... }   always server-side
 *
 * Adding a new engine = one file + one line here. Adding new activities needs no code.
 */
export const ENGINES = Object.fromEntries(
  [quiz, ordering, matching, scenario, written].map((e) => [e.key, e]),
);
export const ENGINE_KEYS = Object.keys(ENGINES);

export const getEngine = (key) => ENGINES[key] ?? null;
