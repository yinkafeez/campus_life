import { z } from 'zod';
import { shuffle } from '../../learning/engines/shared.js';
import { boundedRecord } from '../../../shared/boundedRecord.js';

/*
 * TRIVIA — N questions from the university's question bank, answered against the clock.
 * Score = 100 per correct answer + a speed bonus (up to 200) scaled by accuracy, where the
 * time is measured by the SERVER (start → submit). Duels use the same seed = same questions.
 */
const QUESTIONS_PER_GAME = 7;
const TIME_LIMIT = 120;

export const triviaContentSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(40),
            category: z.string().trim().min(2).max(40),
            prompt: z.string().trim().min(3).max(300),
            options: z
              .array(
                z
                  .object({ id: z.string().max(10), text: z.string().trim().min(1).max(160) })
                  .strict(),
              )
              .min(2)
              .max(5),
            correct: z.string().max(10),
          })
          .strict()
          .refine((q) => q.options.some((o) => o.id === q.correct), {
            message: 'correct must be an option id',
          }),
      )
      .min(QUESTIONS_PER_GAME),
  })
  .strict();

export default {
  key: 'trivia',
  name: 'Campus trivia',
  sport: 'Trivia',
  implemented: true,
  modes: ['solo', 'duel', 'competition'],
  scope: `${QUESTIONS_PER_GAME} questions, ${TIME_LIMIT} seconds. Correct answers and speed both count.`,
  timeLimitSeconds: TIME_LIMIT,
  answerSchema: z
    .object({
      answers: boundedRecord(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), z.string().max(10)),
    })
    .strict(),

  create(rand, content) {
    const picked = shuffle(content.questions, rand).slice(0, QUESTIONS_PER_GAME);
    return {
      secret: { questionIds: picked.map((q) => q.id) },
      view: {
        questions: picked.map((q) => ({
          id: q.id,
          category: q.category,
          prompt: q.prompt,
          options: shuffle(q.options, rand).map((o) => ({ id: o.id, text: o.text })),
        })),
      },
      timeLimitSeconds: TIME_LIMIT,
    };
  },

  score({ secret, answer, content, durationMs }) {
    const bank = new Map(content.questions.map((q) => [q.id, q]));
    const details = secret.questionIds.map((id) => {
      const q = bank.get(id);
      const chosen = answer.answers[id] ?? null;
      return {
        id,
        correct: chosen === q?.correct,
        answer: q?.options.find((o) => o.id === q.correct)?.text ?? null,
      };
    });
    const correct = details.filter((d) => d.correct).length;
    const total = details.length;
    const timeShare = Math.max(0, 1 - durationMs / (TIME_LIMIT * 1000));
    const bonus = Math.round(200 * timeShare * (correct / total));
    return {
      score: correct * 100 + bonus,
      max: total * 100 + 200,
      perfect: correct === total,
      correct,
      total,
      details,
    };
  },
};
