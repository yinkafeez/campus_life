import trivia from './trivia.js';
import penalties from './penalties.js';

/*
 * GAME TYPES — the reusable mini-game framework.
 *
 * A playable type implements:
 *   key, name, sport, modes ['solo' | 'duel' | 'competition'], implemented: true
 *   create(rand, content) → { secret, view, timeLimitSeconds }   (secret never leaves the server)
 *   answerSchema (zod)
 *   score({ secret, answer, content, durationMs }) → { score, max, perfect, details }
 * Higher score wins; scores are computed on the server only, from server-held secrets.
 *
 * Planned types are listed with an honest scope so the client can show "coming later":
 * real-time skill games (tennis, basketball…) can't trust client-reported timing, so they
 * are planned as server-seeded choice games or unranked practice — never fake simulations.
 */
const PLANNED = [
  {
    key: 'football-match',
    name: 'Football match',
    sport: 'Football',
    scope:
      'Turn-based tactics: pick formation and plays; the server simulates the outcome from seeded randomness. The penalty shootout is the first football game.',
  },
  {
    key: 'tennis',
    name: 'Tennis',
    sport: 'Tennis',
    scope:
      'Rally of shot choices (placement vs risk) resolved by the server. Real-time timing input would be unranked practice only.',
  },
  {
    key: 'table-tennis',
    name: 'Table tennis',
    sport: 'Table tennis',
    scope: 'Same rally engine as tennis, first to 11 points.',
  },
  {
    key: 'basketball',
    name: 'Basketball free throws',
    sport: 'Basketball',
    scope: 'Shot selection with server-seeded outcomes; full games are out of scope for now.',
  },
  {
    key: 'chess',
    name: 'Chess',
    sport: 'Chess',
    scope:
      'Correspondence (turn-by-turn) games with every move validated on the server and Elo ratings.',
  },
  {
    key: 'ludo',
    name: 'Ludo',
    sport: 'Ludo',
    scope: '2–4 players, dice rolled by the server, moves validated by the server.',
  },
  {
    key: 'debate',
    name: 'Debate',
    sport: 'Debate',
    scope:
      'Competition rounds using the written-rubric engine from studies plus capped audience votes.',
  },
  {
    key: 'dance',
    name: 'Dance competition',
    sport: 'Dance',
    scope: 'Event entries (choreography choices) judged by peer votes with anti-collusion limits.',
  },
];

export const GAME_TYPES = Object.fromEntries([trivia, penalties].map((t) => [t.key, t]));
export const GAME_TYPE_KEYS = Object.keys(GAME_TYPES);
export const PLANNED_TYPES = PLANNED.map((p) => ({ ...p, implemented: false, modes: [] }));

export const getGameType = (key) => GAME_TYPES[key] ?? null;
