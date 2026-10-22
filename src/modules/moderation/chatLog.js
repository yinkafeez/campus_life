import { randomUUID } from 'node:crypto';

// recent zone-chat lines kept in memory so a report can quote exactly what was said
// (zone chat isn't stored in the database). Oldest lines drop off first.
const MAX_LINES = 2000;
const lines = new Map(); // id → { id, sender, zoneRoom, text, at }

export function rememberChat({ sender, zoneRoom, text }) {
  const line = { id: randomUUID(), sender: String(sender), zoneRoom, text, at: new Date() };
  lines.set(line.id, line);
  if (lines.size > MAX_LINES) lines.delete(lines.keys().next().value);
  return line;
}

export const findChat = (id) => lines.get(id) ?? null;

export function resetChatLog() {
  lines.clear();
}
