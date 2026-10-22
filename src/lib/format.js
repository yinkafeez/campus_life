const DATE = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatDate(value) {
  if (!value) return "";
  return DATE.format(new Date(value));
}
