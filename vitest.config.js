import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // one in-memory MongoDB for the whole run; each test file uses its own database
    globalSetup: ['./tests/setup/globalMongo.js'],
    // the first run may download a MongoDB binary (skip it by setting MONGOMS_SYSTEM_BINARY)
    hookTimeout: 180_000,
    testTimeout: 20_000,
    // every file imports the full seed data; too many parallel workers exhaust memory on
    // small machines (Windows worker crashes). Half the cores, at most 4.
    maxWorkers: Math.max(1, Math.min(4, Math.floor(cpus().length / 2))),
    env: { NODE_ENV: 'test' },
  },
});
