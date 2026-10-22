import { z } from 'zod';
import { itemId, shuffle, text, token, uniqueIds } from './shared.js';
import { boundedRecord } from '../../../shared/boundedRecord.js';

/*
 * MATCHING — pair each term with its partner (device ↔ example, concept ↔ definition).
 * The right-hand side is shuffled and re-labelled with per-attempt tokens, so ids
 * can't give the answer away. The token → pair mapping stays on the server.
 */
export default {
  key: 'matching',
  label: 'Match the pairs',
  contentSchema: z
    .object({
      instructions: text(400),
      leftLabel: z.string().trim().max(40).default('Term'),
      rightLabel: z.string().trim().max(40).default('Match'),
      pairs: z
        .array(z.object({ id: itemId, left: text(200), right: text(300) }).strict())
        .min(3)
        .max(10),
    })
    .strict()
    .refine((c) => uniqueIds(c.pairs, 'pair') === true, { message: 'pair ids must be unique' }),

  answerSchema: z.object({ matches: boundedRecord(itemId, z.string().max(12)) }).strict(),

  present(content, rand) {
    const tokens = {};
    const used = new Set();
    content.pairs.forEach((p) => {
      let t = token(rand);
      while (used.has(t)) t = token(rand);
      used.add(t);
      tokens[t] = p.id;
    });
    const byPair = Object.fromEntries(Object.entries(tokens).map(([t, id]) => [id, t]));
    return {
      view: {
        instructions: content.instructions,
        leftLabel: content.leftLabel,
        rightLabel: content.rightLabel,
        left: content.pairs.map((p) => ({ id: p.id, text: p.left })),
        right: shuffle(content.pairs, rand).map((p) => ({ id: byPair[p.id], text: p.right })),
      },
      secret: { tokens },
    };
  },

  score(content, { matches }, secret) {
    const tokens = secret?.tokens ?? {};
    const feedback = content.pairs.map((p) => ({
      id: p.id,
      correct: tokens[matches[p.id]] === p.id,
      left: p.left,
      answer: p.right,
    }));
    return { score: feedback.filter((f) => f.correct).length, max: content.pairs.length, feedback };
  },
};
