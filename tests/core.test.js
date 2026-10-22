import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import validate from '../src/core/middleware/validate.js';
import catchAsync from '../src/core/http/catchAsync.js';
import { sendSuccess } from '../src/core/http/respond.js';
import { createErrorHandler, normaliseError } from '../src/core/errors/errorHandler.js';
import AppError from '../src/core/errors/AppError.js';

// a tiny app that exercises the shared building blocks the modules will use
function miniApp({ isProduction = false } = {}) {
  const app = express();
  app.use(express.json());

  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().regex(/^\d+$/) }),
      query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      body: z.object({ name: z.string().min(2) }).strict(),
    }),
    (req, res) => sendSuccess(res, { item: req.validated }, { statusCode: 201 }),
  );
  app.get('/list', (req, res) => sendSuccess(res, { items: [1, 2, 3] }));
  app.get(
    '/boom',
    catchAsync(async () => {
      throw new Error('secret database detail');
    }),
  );
  app.get('/forbidden', () => {
    throw AppError.forbidden();
  });

  app.use(createErrorHandler({ isProduction }));
  return app;
}

describe('validate middleware', () => {
  it('passes parsed values on req.validated', async () => {
    const res = await request(miniApp()).post('/items/42?page=3').send({ name: 'Jaja' });

    expect(res.status).toBe(201);
    expect(res.body.data.item).toEqual({
      params: { id: '42' },
      query: { page: 3 },
      body: { name: 'Jaja' },
    });
  });

  it('collects every problem into one VALIDATION_ERROR', async () => {
    const res = await request(miniApp())
      .post('/items/abc?page=0')
      .send({ name: 'x', role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((el) => el.path);
    expect(paths).toEqual(expect.arrayContaining(['params.id', 'query.page', 'body.name', 'body']));
  });
});

describe('response helpers', () => {
  it('adds results for list payloads', async () => {
    const res = await request(miniApp()).get('/list');
    expect(res.body).toEqual({ status: 'success', results: 3, data: { items: [1, 2, 3] } });
  });
});

describe('error handler', () => {
  it('maps operational errors to their status and code', async () => {
    const res = await request(miniApp()).get('/forbidden');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('shows details of unknown errors in development', async () => {
    const res = await request(miniApp()).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('secret database detail');
    expect(res.body.error.stack).toBeDefined();
  });

  it('hides details of unknown errors in production', async () => {
    const res = await request(miniApp({ isProduction: true })).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went very wrong!',
    });
  });

  it('normalises mongoose and mongo errors', () => {
    expect(normaliseError({ name: 'CastError', path: '_id', value: 'abc' })).toMatchObject({
      statusCode: 400,
      code: 'INVALID_ID',
    });
    expect(normaliseError({ code: 11000, keyValue: { slug: 'unilag' } })).toMatchObject({
      statusCode: 409,
      code: 'DUPLICATE_KEY',
      details: [{ path: 'slug', message: 'Already taken' }],
    });
    expect(
      normaliseError({
        name: 'ValidationError',
        errors: { name: { path: 'name', message: 'Required' } },
      }),
    ).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(normaliseError(new Error('bug'))).toBeNull();
  });
});
