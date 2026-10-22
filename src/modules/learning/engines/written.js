import { z } from 'zod';
import { itemId, text, uniqueIds } from './shared.js';

/*
 * WRITTEN — a short written response (a debate argument, a headline and lede, a poem,
 * a case summary) scored by an automatic RUBRIC: each criterion lists key ideas
 * (keywords / phrases); mentioning any of them earns that criterion's points.
 * It checks that key ideas are present — it does not judge quality, and the player
 * is told so. Too short or too long → no score.
 */
const criterion = z
  .object({
    id: itemId,
    label: text(160),
    keywords: z.array(z.string().trim().toLowerCase().min(2).max(40)).min(1).max(15),
    points: z.number().int().min(1).max(10),
  })
  .strict();

const normalise = (value) =>
  ` ${String(value)
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')} `;

export const countWords = (value) => (String(value).trim().match(/\S+/g) ?? []).length;

export default {
  key: 'written',
  label: 'Written response',
  contentSchema: z
    .object({
      prompt: text(1200),
      minWords: z.number().int().min(1).max(500).default(30),
      maxWords: z.number().int().min(5).max(800).default(250),
      criteria: z.array(criterion).min(1).max(8),
      modelAnswer: z.string().trim().max(1500).optional(),
    })
    .strict()
    .refine((c) => c.maxWords > c.minWords, { message: 'maxWords must be more than minWords' })
    .refine((c) => uniqueIds(c.criteria, 'criterion') === true, {
      message: 'criterion ids must be unique',
    }),

  answerSchema: z.object({ text: z.string().max(6000) }).strict(),

  present(content) {
    return {
      view: {
        prompt: content.prompt,
        minWords: content.minWords,
        maxWords: content.maxWords,
        // players see WHAT is assessed (not the keywords)
        criteria: content.criteria.map((c) => ({ id: c.id, label: c.label, points: c.points })),
      },
      secret: null,
    };
  },

  score(content, { text: answer }) {
    const max = content.criteria.reduce((sum, c) => sum + c.points, 0);
    const words = countWords(answer);
    const body = normalise(answer);
    const lengthOk = words >= content.minWords && words <= content.maxWords;
    const feedback = content.criteria.map((c) => {
      const met = lengthOk && c.keywords.some((k) => body.includes(` ${k}`));
      return { id: c.id, correct: met, label: c.label, points: met ? c.points : 0 };
    });
    return {
      score: feedback.reduce((sum, f) => sum + f.points, 0),
      max,
      feedback,
      words,
      lengthOk,
      explanation: lengthOk
        ? (content.modelAnswer ?? null)
        : `Write between ${content.minWords} and ${content.maxWords} words (you wrote ${words}).`,
    };
  },
};
