import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildTestApp } from './helpers/testApp.js';
import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db.js';
import { Player, Session, User } from '../src/modules/models.js';

const { app } = buildTestApp({ AUTH_MAX_FAILED_LOGINS: '3', AUTH_RATE_LIMIT_MAX: '100' });

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(closeTestDb);

const newPlayer = (overrides = {}) => ({
  email: 'ada.test@example.test',
  username: 'ada_test',
  password: 'Lagoon-breeze-2026',
  displayName: 'Ada',
  confirmAge: true,
  ...overrides,
});

const cookiesOf = (res) => (res.headers['set-cookie'] ?? []).join(';');

describe('registration', () => {
  it('creates the account and profile, hashes the password and signs in with httpOnly cookies', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(newPlayer());

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'ada.test@example.test', role: 'player' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.player.displayName).toBe('Ada');

    const cookies = cookiesOf(res);
    expect(cookies).toMatch(/cl_access=[^;]+;.*HttpOnly/i);
    expect(cookies).toMatch(/cl_refresh=[^;]+;.*Path=\/api\/v1\/auth/i);

    const stored = await User.findOne({ username: 'ada_test' }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored.passwordHash).not.toContain('Lagoon');
    expect(await Player.countDocuments()).toBe(1);
  });

  it('validates every field on the server', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      username: 'A',
      password: 'short',
      displayName: 'X',
      confirmAge: false,
      role: 'admin',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((el) => el.path)).toEqual(
      expect.arrayContaining([
        'body.email',
        'body.username',
        'body.password',
        'body.displayName',
        'body.confirmAge',
        'body', // unknown "role" — players can never set their own role
      ]),
    );
  });

  it('rejects passwords longer than bcrypt can use and duplicate accounts', async () => {
    const long = await request(app)
      .post('/api/v1/auth/register')
      .send(newPlayer({ password: `A1${'x'.repeat(80)}` }));
    expect(long.status).toBe(400);

    await request(app).post('/api/v1/auth/register').send(newPlayer());
    const dup = await request(app)
      .post('/api/v1/auth/register')
      .send(newPlayer({ username: 'other_name' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ACCOUNT_EXISTS');
  });
});

describe('login', () => {
  it('signs in with email or username', async () => {
    await request(app).post('/api/v1/auth/register').send(newPlayer());

    const byEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'ADA.TEST@example.test', password: 'Lagoon-breeze-2026' });
    expect(byEmail.status).toBe(200);
    expect(cookiesOf(byEmail)).toMatch(/cl_access=/);

    const byUsername = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'ada_test', password: 'Lagoon-breeze-2026' });
    expect(byUsername.body.data.player.displayName).toBe('Ada');
  });

  it('gives the same safe error for unknown users and wrong passwords', async () => {
    await request(app).post('/api/v1/auth/register').send(newPlayer());

    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'nobody_here', password: 'whatever-1' });
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'ada_test', password: 'wrong-password-1' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error).toEqual(wrong.body.error);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    await request(app).post('/api/v1/auth/register').send(newPlayer());
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'ada_test', password: 'wrong-password-1' });
    }
    const locked = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: 'ada_test', password: 'Lagoon-breeze-2026' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rate-limits failed logins per IP', async () => {
    const { app: strict } = buildTestApp({ AUTH_RATE_LIMIT_MAX: '2' });
    const attempt = () =>
      request(strict)
        .post('/api/v1/auth/login')
        .send({ identifier: 'nobody_x', password: 'nope-123' });
    await attempt();
    await attempt();
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('sessions', () => {
  it('protects /me and serves the signed-in user', async () => {
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);

    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(newPlayer());
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBe('ada_test');
  });

  it('rejects tampered access tokens', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'cl_access=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rotates the refresh token and detects reuse of an old one', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(newPlayer());
    const firstRefresh = reg.headers['set-cookie'].find((el) => el.startsWith('cl_refresh='));
    const firstToken = firstRefresh.split(';')[0];

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstToken);
    expect(rotated.status).toBe(200);
    const secondToken = rotated.headers['set-cookie']
      .find((el) => el.startsWith('cl_refresh='))
      .split(';')[0];
    expect(secondToken).not.toBe(firstToken);

    // move the rotation outside the two-tab grace window, then replay the OLD token
    await Session.updateMany(
      { revokedReason: 'rotated' },
      { revokedAt: new Date(Date.now() - 60_000) },
    );
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', firstToken);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');

    // the whole family is gone — even the newest token stops working
    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', secondToken);
    expect(after.status).toBe(401);
  });

  it('logout ends the session on this device', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(newPlayer());

    const out = await agent.post('/api/v1/auth/logout');
    expect(out.status).toBe(204);
    expect(cookiesOf(out)).toMatch(/cl_access=;/);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
    expect((await agent.post('/api/v1/auth/refresh')).status).toBe(401);
  });

  it('logout-all invalidates existing access tokens', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/v1/auth/register').send(newPlayer());
    const access = reg.headers['set-cookie']
      .find((el) => el.startsWith('cl_access='))
      .split(';')[0];

    await agent.post('/api/v1/auth/logout-all');
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', access);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
  });
});

describe('player profile', () => {
  it('lets a player update only their own game profile', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(newPlayer());

    const updated = await agent
      .patch('/api/v1/players/me')
      .send({ displayName: 'Ada Lagoon', gender: 'female', bio: 'Fresher. Loves jollof.' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.player).toMatchObject({ displayName: 'Ada Lagoon', gender: 'female' });

    const sneaky = await agent
      .patch('/api/v1/players/me')
      .send({ user: '000000000000000000000000' });
    expect(sneaky.status).toBe(400);
  });
});
