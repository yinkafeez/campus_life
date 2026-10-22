import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';

// no database connection in this file: covers the HTTP layer on its own
const { app } = buildTestApp({ CLIENT_URL: 'http://localhost:5173' });

describe('GET /api/v1/health', () => {
  it('answers 200 with the success envelope even while the DB is down', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toMatchObject({
      service: 'campus-life-api',
      db: { state: 'disconnected' },
    });
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
  });

  it('sets a request id and security headers', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.headers['x-request-id']).toMatch(/^[\w.-]{8,64}$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('reuses a safe incoming X-Request-Id', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Request-Id', 'client-req-12345');
    expect(res.headers['x-request-id']).toBe('client-req-12345');
  });
});

describe('GET /api/v1/health/ready', () => {
  it('answers 503 NOT_READY when the database is not connected', async () => {
    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', error: { code: 'NOT_READY' } });
  });
});

describe('error format', () => {
  it('returns the error envelope for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      status: 'fail',
      error: { code: 'ROUTE_NOT_FOUND', message: expect.stringContaining('/api/v1/nope') },
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects oversized bodies with 413', async () => {
    const { app: tinyApp } = buildTestApp({ JSON_BODY_LIMIT: '10b' });
    const res = await request(tinyApp).post('/api/v1/health').send({ much: 'too much data' });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  it('allows a configured origin with credentials', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects an unknown origin with 403 CORS_FORBIDDEN', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_FORBIDDEN');
  });
});

describe('rate limiting', () => {
  it('answers 429 RATE_LIMITED after the limit', async () => {
    const { app: limited } = buildTestApp({ RATE_LIMIT_MAX: '2' });
    await request(limited).get('/api/v1/health');
    await request(limited).get('/api/v1/health');
    const res = await request(limited).get('/api/v1/health');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
