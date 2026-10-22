import { z } from 'zod';
import { itemId, shuffle, text, uniqueIds } from './shared.js';
import { boundedRecord } from '../../../shared/boundedRecord.js';

/*
 * QUIZ — multiple-choice questions, one correct option each.
 * Used for knowledge checks, "spot the bug", case-analysis holdings, clinical facts…
 */
const option = z.object({ id: itemId, text: text(300) }).strict();
const question = z
  .object({
    id: itemId,
    prompt: text(800),
    // optional code / case extract shown with the question (monospace for code)
    snippet: z.string().max(1500).optional(),
    options: z.array(option).min(2).max(6),
    correct: itemId,
    explanation: z.string().trim().max(600).optional(),
  })
  .strict()
  .refine((q) => q.options.some((o) => o.id === q.correct), {
    message: 'correct must be one of the option ids',
  })
  .refine((q) => uniqueIds(q.options, 'option') === true, { message: 'option ids must be unique' });

export default {
  key: 'quiz',
  label: 'Quiz',
  contentSchema: z
    .object({
      instructions: z.string().trim().max(400).optional(),
      questions: z.array(question).min(1).max(20),
      shuffleOptions: z.boolean().default(true),
    })
    .strict()
    .refine((c) => uniqueIds(c.questions, 'question') === true, {
      message: 'question ids must be unique',
    }),

  answerSchema: z.object({ answers: boundedRecord(itemId, itemId) }).strict(),

  present(content, rand) {
    return {
      view: {
        instructions: content.instructions ?? null,
        questions: content.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          snippet: q.snippet ?? null,
          options: (content.shuffleOptions ? shuffle(q.options, rand) : q.options).map((o) => ({
            id: o.id,
            text: o.text,
          })),
        })),
      },
      secret: null,
    };
  },

  score(content, { answers }) {
    const feedback = content.questions.map((q) => {
      const chosen = answers[q.id] ?? null;
      const correct = chosen === q.correct;
      return {
        id: q.id,
        correct,
        chosen,
        answer: q.options.find((o) => o.id === q.correct)?.text,
        explanation: q.explanation ?? null,
      };
    });
    return {
      score: feedback.filter((f) => f.correct).length,
      max: content.questions.length,
      feedback,
    };
  },
};
