// "14:05" today, "Mon 14:05" this week, "12 Oct" before that.
export function formatTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const days = (now - date) / 86_400_000;
  if (date.toDateString() === now.toDateString()) return time;
  if (days < 7)
    return `${date.toLocaleDateString("en-NG", { weekday: "short" })} ${time}`;
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}
