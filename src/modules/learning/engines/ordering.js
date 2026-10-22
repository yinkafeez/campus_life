import { z } from 'zod';
import { itemId, shuffle, text, uniqueIds } from './shared.js';

/*
 * ORDERING — put steps in the right sequence (design process, court procedure,
 * clinical assessment, inverted-pyramid news story…). Content lists items in the
 * correct order; players get them shuffled. One point per item in the right place.
 */
export default {
  key: 'ordering',
  label: 'Put in order',
  contentSchema: z
    .object({
      instructions: text(400),
      items: z
        .array(z.object({ id: itemId, text: text(300) }).strict())
        .min(3)
        .max(12),
      explanation: z.string().trim().max(800).optional(),
    })
    .strict()
    .refine((c) => uniqueIds(c.items, 'item') === true, { message: 'item ids must be unique' }),

  answerSchema: z.object({ order: z.array(itemId).max(12) }).strict(),

  present(content, rand) {
    let items = shuffle(content.items, rand);
    // never hand out the answer already in order
    if (items.every((el, i) => el.id === content.items[i].id))
      items = [...items.slice(1), items[0]];
    return {
      view: {
        instructions: content.instructions,
        items: items.map(({ id, text: t }) => ({ id, text: t })),
      },
      secret: null,
    };
  },

  score(content, { order }) {
    const feedback = content.items.map((item, i) => ({
      id: item.id,
      correct: order[i] === item.id,
      position: i + 1,
      text: item.text,
    }));
    return {
      score: feedback.filter((f) => f.correct).length,
      max: content.items.length,
      feedback,
      explanation: content.explanation ?? null,
    };
  },
};
