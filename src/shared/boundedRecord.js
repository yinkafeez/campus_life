import { z } from 'zod';

/**
 * A key → value answer object with a sane number of keys. Answers are stored with the
 * attempt, so an unbounded object would let a client store whatever it likes (up to the
 * body limit). Real answers have one key per question/item; 60 is far above any activity.
 */
export const MAX_ANSWER_KEYS = 60;

export const boundedRecord = (key, value, max = MAX_ANSWER_KEYS) =>
  z.record(key, value).refine((obj) => Object.keys(obj).length <= max, {
    message: `At most ${max} answers`,
  });
