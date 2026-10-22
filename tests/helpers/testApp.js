import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/core/logger.js';
import { createApp } from '../../src/app.js';

// a fixed, test-only signing secret (never used outside tests)
export const TEST_JWT_SECRET = 'test-only-jwt-secret-0123456789abcdef0123456789';

// an app with test settings (silent logs); override any env value per test
export function buildTestApp(overrides = {}) {
  const env = parseEnv(
    { NODE_ENV: 'test', JWT_ACCESS_SECRET: TEST_JWT_SECRET, ...overrides },
    { forServer: true },
  );
  const logger = createLogger({ level: 'silent' });
  return { app: createApp({ env, logger }), env };
}
