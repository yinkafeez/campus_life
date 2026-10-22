import { afterAll, describe, expect, inject, it } from 'vitest';
import request from 'supertest';
import mongoose from '../../src/core/db/mongoose.js';
import {
  connectDB,
  disconnectDB,
  getDbStatus,
  isDbConnected,
  maskUri,
} from '../../src/core/db/connect.js';
import requireDb from '../../src/core/db/requireDb.js';
import AppError from '../../src/core/errors/AppError.js';
import { buildTestApp } from '../helpers/testApp.js';
import { silentLogger } from '../helpers/db.js';

// nothing listens on port 1, so connections fail fast
const DEAD_URI = 'mongodb://127.0.0.1:1/never';

afterAll(async () => {
  await disconnectDB();
});

describe('maskUri', () => {
  it('hides credentials', () => {
    expect(maskUri('mongodb+srv://yinks:p%40ss@cluster.mongodb.net/db')).toBe(
      'mongodb+srv://***:***@cluster.mongodb.net/db',
    );
    expect(maskUri('mongodb://127.0.0.1:27017/db')).toBe('mongodb://127.0.0.1:27017/db');
  });
});

describe('connectDB — failure handling', () => {
  it('retries, then rejects with a masked, readable error', async () => {
    const warnings = [];
    const logger = { ...silentLogger, warn: (meta) => meta?.attempt && warnings.push(meta) };

    await expect(
      connectDB({
        uri: 'mongodb://user:secret@127.0.0.1:1/never',
        logger,
        retries: 2,
        retryDelayMs: 10,
        serverSelectionTimeoutMS: 200,
      }),
    ).rejects.toThrow(/Could not connect to MongoDB at mongodb:\/\/\*\*\*:\*\*\*@127\.0\.0\.1:1/);

    expect(warnings).toHaveLength(2);
    expect(isDbConnected()).toBe(false);
  });

  it('stops retrying when aborted', async () => {
    const controller = new AbortController();
    const pending = connectDB({
      uri: DEAD_URI,
      logger: silentLogger,
      retries: Infinity,
      retryDelayMs: 50,
      serverSelectionTimeoutMS: 100,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 150);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('requireDb answers 503 DATABASE_UNAVAILABLE while disconnected', () => {
    let forwarded;
    requireDb({}, {}, (err) => {
      forwarded = err;
    });
    expect(forwarded).toBeInstanceOf(AppError);
    expect(forwarded).toMatchObject({ statusCode: 503, code: 'DATABASE_UNAVAILABLE' });
  });
});

describe('connectDB — success', () => {
  it('connects, reports status, and makes the app ready', async () => {
    await connectDB({
      uri: inject('mongoUri'),
      logger: silentLogger,
      retries: 1,
      serverSelectionTimeoutMS: 5000,
    });

    expect(isDbConnected()).toBe(true);
    expect(getDbStatus().state).toBe('connected');

    const { app } = buildTestApp();
    const health = await request(app).get('/api/v1/health');
    expect(health.body.data.db.state).toBe('connected');

    const ready = await request(app).get('/api/v1/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.data.ready).toBe(true);

    let forwarded = 'not called';
    requireDb({}, {}, (err) => {
      forwarded = err;
    });
    expect(forwarded).toBeUndefined();
  });

  it('applies the global safety settings', () => {
    expect(mongoose.get('strictQuery')).toBe(true);
    expect(mongoose.get('sanitizeFilter')).toBe(true);
  });
});
