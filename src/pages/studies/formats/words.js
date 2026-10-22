// word count used by written activities (matches the server's rule)
export const countWords = (text) =>
  (
    String(text ?? "")
      .trim()
      .match(/\S+/g) ?? []
  ).length;
