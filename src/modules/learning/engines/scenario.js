import { z } from 'zod';
import { itemId, shuffle, text, uniqueIds } from './shared.js';
import { boundedRecord } from '../../../shared/boundedRecord.js';

/*
 * SCENARIO — a short story told in steps; at each step the player picks a decision.
 * Every choice is worth points (0..10) and carries feedback: good for design trade-offs,
 * business decisions, simulated clinical cases, ethics dilemmas and debate rebuttals.
 * Score = points earned / best possible points.
 */
const choice = z
  .object({
    id: itemId,
    text: text(300),
    points: z.number().int().min(0).max(10),
    feedback: text(500),
  })
  .strict();

const step = z
  .object({ id: itemId, situation: text(1000), choices: z.array(choice).min(2).max(5) })
  .strict()
  .refine((s) => uniqueIds(s.choices, 'choice') === true, { message: 'choice ids must be unique' })
  .refine((s) => s.choices.some((c) => c.points > 0), {
    message: 'each step needs at least one choice worth points',
  });

export default {
  key: 'scenario',
  label: 'Scenario',
  contentSchema: z
    .object({
      intro: text(1200),
      steps: z.array(step).min(1).max(8),
      debrief: z.string().trim().max(1000).optional(),
    })
    .strict()
    .refine((c) => uniqueIds(c.steps, 'step') === true, { message: 'step ids must be unique' }),

  answerSchema: z.object({ choices: boundedRecord(itemId, itemId) }).strict(),

  present(content, rand) {
    return {
      view: {
        intro: content.intro,
        steps: content.steps.map((s) => ({
          id: s.id,
          situation: s.situation,
          choices: shuffle(s.choices, rand).map((c) => ({ id: c.id, text: c.text })),
        })),
      },
      secret: null,
    };
  },

  score(content, { choices }) {
    let score = 0;
    let max = 0;
    const feedback = content.steps.map((s) => {
      const best = Math.max(...s.choices.map((c) => c.points));
      const picked = s.choices.find((c) => c.id === choices[s.id]);
      max += best;
      score += picked?.points ?? 0;
      return {
        id: s.id,
        correct: Boolean(picked) && picked.points === best,
        points: picked?.points ?? 0,
        best,
        feedback: picked?.feedback ?? 'No decision made.',
      };
    });
    return { score, max, feedback, explanation: content.debrief ?? null };
  },
};
