export const DIFFICULTY_LABELS = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** "Due Fri 24 Oct" or "Was due Fri 24 Oct". */
export function formatDue(iso, now = new Date()) {
  const date = new Date(iso);
  const text = date.toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return date < now ? `was due ${text}` : `due ${text}`;
}
