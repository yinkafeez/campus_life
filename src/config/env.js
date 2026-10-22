import { z } from 'zod';

// every setting the server reads from the environment, validated once at start-up
// (fail fast with a readable message instead of crashing later with "undefined")
const csv = z.string().transform((value) =>
  value
    .split(/[\s,]+/)
    .map((el) => el.trim().replace(/\/+$/, ''))
    .filter(Boolean),
);

// values copied from .env templates that must be replaced before the server runs
const PLACEHOLDER_PATTERN =
  /replace[-_ ]?(me|with|this)|change-?me|placeholder|your[-_]?(key|secret)/i;
const notPlaceholder = (val) => !PLACEHOLDER_PATTERN.test(val);
const PLACEHOLDER_MESSAGE =
  'still has a placeholder value — replace it with a real value in backend/.env';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  // comma-separated list of frontend origins allowed to call the API with cookies
  CLIENT_URL: csv.default(['http://localhost:5173']),
  // the deployed game's origin(s), e.g. https://campuxlife.netlify.app — added to CLIENT_URL.
  // In production only these (plus an explicitly set CLIENT_URL) are allowed.
  PROD_CLIENT_URL: csv.optional(),
  // number of proxies in front of the app (Render, Nginx...) so req.ip is the real client
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  JSON_BODY_LIMIT: z.string().default('100kb'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),

  // SECRETS — read as plain strings here; checked strictly by SERVER_SECRETS below when the
  // API server starts (offline CLI tools like bundle validation don't need them)
  ADMIN_API_KEY: z.string().trim().optional(),
  JWT_ACCESS_SECRET: z.string().trim().optional(),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  // lax: frontend and API on the same site (Vite proxy / same domain); none: different sites (HTTPS only)
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // login/register attempts per RATE_LIMIT_WINDOW_MS per IP
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  // failed logins before an account is locked for AUTH_LOCK_MINUTES
  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().min(3).max(50).default(8),
  AUTH_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  // university bundles can be large; only admin routes accept this much
  ADMIN_JSON_BODY_LIMIT: z.string().default('2mb'),
  ADMIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  // DATABASE
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://')
    .default('mongodb://127.0.0.1:27017/campus_life_dev'),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  // connection attempts before giving up (production) or switching to background retries (development)
  MONGODB_CONNECT_RETRIES: z.coerce.number().int().min(1).default(5),
  MONGODB_RETRY_DELAY_MS: z.coerce.number().int().positive().default(2000),
  // database to use when the URI has none (Atlas URIs often end in "/?retryWrites=...")
  MONGODB_DB_NAME: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,63}$/, 'may only contain letters, digits, _ and -')
    .optional(),
  // optional: fill <db_username>/<db_password> (Atlas style) or <USERNAME>/<PASSWORD>
  // placeholders in MONGODB_URI — URL-encoded automatically
  DB_USERNAME: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  // optional DNS resolvers for the mongodb+srv lookup, e.g. "8.8.8.8,1.1.1.1" — fixes
  // "querySrv ECONNREFUSED" when the system resolver can't answer SRV queries (common on Windows)
  DNS_SERVERS: csv
    .refine((list) => list.every((el) => /^[\d.:a-fA-F]+$/.test(el)), {
      message: 'must be a comma-separated list of IP addresses',
    })
    .optional(),
});

// secrets the API server must have before it starts
const secret = z
  .string()
  .min(32, 'must be at least 32 characters')
  .refine(notPlaceholder, { message: PLACEHOLDER_MESSAGE });

const SERVER_SECRETS = z.object({
  // signs the short-lived login access token (refresh tokens are random, stored hashed)
  JWT_ACCESS_SECRET: z
    .string({ error: 'is required — add it to backend/.env' })
    .min(32, 'must be at least 32 characters')
    .refine(notPlaceholder, { message: PLACEHOLDER_MESSAGE }),
  // operator admin key: optional — empty switches admin keys off (admin accounts still work)
  ADMIN_API_KEY: secret.optional(),
});

// does the connection string already name a database? (mongodb+srv://host/dbname?...)
const uriHasDatabase = (uri) => /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri);

// MONGODB_URI may hold <db_password> / <db_username> placeholders (filled in server.js, Natours
// style) — make sure the values to fill them with exist
function credentialProblems({ MONGODB_URI, DB_USERNAME, DB_PASSWORD }) {
  return [
    [/<(db_)?username>/i, 'DB_USERNAME', DB_USERNAME],
    [/<(db_)?password>/i, 'DB_PASSWORD', DB_PASSWORD],
  ]
    .map(([token, name, value]) => {
      const found = token.exec(MONGODB_URI);
      return found && !value
        ? `  - ${name}: is required because MONGODB_URI contains ${found[0]}`
        : null;
    })
    .filter(Boolean);
}

// production must not run with development-only settings (cookies over plain http, etc.)
function productionProblems({ CLIENT_URL }) {
  if (!CLIENT_URL.length)
    return [
      '  - CLIENT_URL / PROD_CLIENT_URL: set the deployed game origin, e.g. https://your-game.netlify.app',
    ];
  const insecure = CLIENT_URL.filter((origin) => !origin.startsWith('https://'));
  return insecure.length
    ? [`  - CLIENT_URL: production origins must use https:// (got ${insecure.join(', ')})`]
    : [];
}

/**
 * The origins CORS (REST + Socket.IO) accepts: CLIENT_URL plus PROD_CLIENT_URL.
 * In production the built-in localhost default is dropped — only origins you set count.
 */
function allowedOrigins(env, source) {
  const base =
    env.NODE_ENV === 'production' && source.CLIENT_URL === undefined ? [] : env.CLIENT_URL;
  return [...new Set([...base, ...(env.PROD_CLIENT_URL ?? [])])];
}

const formatIssues = (issues) =>
  issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);

/**
 * Parse and validate an environment object (defaults to process.env).
 *   forServer: true → the API server's secrets must be present and real (not placeholders)
 * Throws an Error listing every invalid variable.
 */
export function parseEnv(source = process.env, { forServer = false } = {}) {
  const result = envSchema.safeParse(source);
  const problems = result.success ? [] : formatIssues(result.error.issues);

  const env = result.data ?? {};
  // an empty ADMIN_API_KEY means "admin keys off"
  if (env.ADMIN_API_KEY === '') env.ADMIN_API_KEY = undefined;

  if (forServer && result.success) {
    const secrets = SERVER_SECRETS.safeParse(env);
    if (!secrets.success) problems.push(...formatIssues(secrets.error.issues));
  }

  if (result.success) {
    env.CLIENT_URL = allowedOrigins(env, source);
    problems.push(...credentialProblems(env));
  }
  if (result.success && forServer && env.NODE_ENV === 'production')
    problems.push(...productionProblems(env));

  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n${problems.join('\n')}`);
  }

  return {
    ...env,
    MONGODB_DB_NAME:
      env.MONGODB_DB_NAME ?? (uriHasDatabase(env.MONGODB_URI) ? undefined : 'campus_life'),
    LOG_LEVEL: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  };
}
