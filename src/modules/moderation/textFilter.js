import { readFileSync } from 'node:fs';

/*
 * Chat safety filter:
 *  - masks blocked words (data/moderation/filter.json) → "f***"
 *  - in PUBLIC chat, hides personal contact details (phone numbers, emails, @handles)
 *    so players don't overshare with strangers; private messages keep them
 * It is a first line of defence only — reports + moderators handle the rest.
 */
const { blockedWords } = JSON.parse(
  readFileSync(new URL('../../../data/moderation/filter.json', import.meta.url), 'utf8'),
);

const WORDS = new RegExp(
  `\\b(${blockedWords.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
);
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Nigerian numbers: 080/081/070/090/091…, +234 / 234 prefixes, with optional spaces or dashes
const PHONE = /(\+?234[\s-]?|0)[789][01]\d([\s-]?\d){7}/g;
const HANDLE = /(^|\s)@[a-z0-9_.]{3,}/gi;

const mask = (word) => word[0] + '*'.repeat(Math.max(1, word.length - 1));

export const MAX_MESSAGE_LENGTH = 500;

/** Clean a chat/message text. Returns { text, masked } (masked = something was changed). */
export function filterText(raw, { isPublic = false } = {}) {
  let text = String(raw ?? '')
    // eslint-disable-next-line no-control-regex -- stripping control characters on purpose
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s{3,}/g, '  ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
  const original = text;

  text = text.replace(WORDS, (word) => mask(word));
  if (isPublic) {
    text = text
      .replace(EMAIL, '[contact hidden]')
      .replace(PHONE, '[contact hidden]')
      .replace(HANDLE, (match, lead) => `${lead}[handle hidden]`);
  }
  return { text, masked: text !== original };
}

/** Simple per-key rate limiter (e.g. per player): max `limit` events per `windowMs`. */
export function createRateLimiter({ limit, windowMs }) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
