/**
 * Build the MongoDB connection string from .env — the same steps server.js runs (Natours style):
 * the <db_password> (and optional <db_username>) placeholder in MONGODB_URI is replaced with
 * DB_PASSWORD / DB_USERNAME, URL-encoded so characters like @ : / ? # can't break the URI.
 * Used by the CLI scripts; server.js does it inline so the steps are visible at start-up.
 */
export const buildDatabaseUri = (env) =>
  env.MONGODB_URI
    // replacer functions: a "$" in the password must not be read as a replacement pattern
    .replace(/<(db_)?password>/i, () => encodeURIComponent(env.DB_PASSWORD ?? ''))
    .replace(/<(db_)?username>/i, () => encodeURIComponent(env.DB_USERNAME ?? ''));
