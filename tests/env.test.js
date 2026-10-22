import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { buildDatabaseUri } from '../src/config/database.js';

describe('parseEnv', () => {
  it('applies safe local-development defaults', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(5000);
    expect(env.CLIENT_URL).toEqual(['http://localhost:5173']);
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/campus_life_dev');
    expect(env.isProduction).toBe(false);
  });

  it('splits CLIENT_URL on commas/spaces and strips trailing slashes', () => {
    const env = parseEnv({ CLIENT_URL: 'https://a.ng/, https://b.ng  http://localhost:5173' });
    expect(env.CLIENT_URL).toEqual(['https://a.ng', 'https://b.ng', 'http://localhost:5173']);
  });

  it('refuses plain-http frontend origins in production', () => {
    const secret = 'x'.repeat(40);
    expect(() =>
      parseEnv(
        { NODE_ENV: 'production', JWT_ACCESS_SECRET: secret, CLIENT_URL: 'http://game.example' },
        { forServer: true },
      ),
    ).toThrow(/https/);
    expect(
      parseEnv(
        { NODE_ENV: 'production', JWT_ACCESS_SECRET: secret, CLIENT_URL: 'https://game.example' },
        { forServer: true },
      ).isProduction,
    ).toBe(true);
  });

  it('adds PROD_CLIENT_URL to the allowed origins (and uses only set origins in production)', () => {
    const dev = parseEnv({ PROD_CLIENT_URL: 'https://campuxlife.netlify.app/' });
    expect(dev.CLIENT_URL).toEqual(['http://localhost:5173', 'https://campuxlife.netlify.app']);

    const secret = 'x'.repeat(40);
    const prod = parseEnv(
      {
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: secret,
        PROD_CLIENT_URL: 'https://campuxlife.netlify.app',
      },
      { forServer: true },
    );
    expect(prod.CLIENT_URL).toEqual(['https://campuxlife.netlify.app']);
    // production with no origin set at all is refused (instead of silently allowing localhost)
    expect(() =>
      parseEnv({ NODE_ENV: 'production', JWT_ACCESS_SECRET: secret }, { forServer: true }),
    ).toThrow(/PROD_CLIENT_URL/);
  });

  it('is silent by default in tests', () => {
    expect(parseEnv({ NODE_ENV: 'test' }).LOG_LEVEL).toBe('silent');
  });

  it('lists every invalid variable in one error', () => {
    expect(() =>
      parseEnv({ PORT: 'abc', MONGODB_URI: 'postgres://x', NODE_ENV: 'staging' }),
    ).toThrow(/PORT[\s\S]*MONGODB_URI|MONGODB_URI[\s\S]*PORT/);
  });
});

describe('server secrets and MongoDB credentials', () => {
  const realSecret = 'a'.repeat(40) + 'b1';

  it('does not need secrets for offline tools', () => {
    expect(() =>
      parseEnv({ JWT_ACCESS_SECRET: 'REPLACE_ME_with_64_random_hex_characters' }),
    ).not.toThrow();
  });

  it('requires a real JWT secret for the API server', () => {
    expect(() => parseEnv({}, { forServer: true })).toThrow(/JWT_ACCESS_SECRET: is required/);
    expect(() =>
      parseEnv(
        { JWT_ACCESS_SECRET: 'REPLACE_ME_with_64_random_hex_characters' },
        { forServer: true },
      ),
    ).toThrow(/JWT_ACCESS_SECRET: still has a placeholder value/);
    expect(() => parseEnv({ JWT_ACCESS_SECRET: 'short' }, { forServer: true })).toThrow(
      /at least 32/,
    );
    expect(parseEnv({ JWT_ACCESS_SECRET: realSecret }, { forServer: true }).JWT_ACCESS_SECRET).toBe(
      realSecret,
    );
  });

  it('treats an empty ADMIN_API_KEY as "admin keys off" but rejects placeholders', () => {
    expect(
      parseEnv({ JWT_ACCESS_SECRET: realSecret, ADMIN_API_KEY: '' }, { forServer: true })
        .ADMIN_API_KEY,
    ).toBeUndefined();
    expect(() =>
      parseEnv(
        {
          JWT_ACCESS_SECRET: realSecret,
          ADMIN_API_KEY: 'REPLACE_ME_with_64_random_hex_characters',
        },
        { forServer: true },
      ),
    ).toThrow(/ADMIN_API_KEY: still has a placeholder value/);
  });

  it('keeps the URI as written; buildDatabaseUri fills the password (URL-encoded)', () => {
    const env = parseEnv({
      MONGODB_URI: 'mongodb+srv://yinks:<db_password>@cluster0.example.net/?retryWrites=true',
      DB_PASSWORD: 'p@ss:word/1',
    });
    // parseEnv only validates — server.js does the replace (Natours style)
    expect(env.MONGODB_URI).toContain('<db_password>');
    expect(buildDatabaseUri(env)).toBe(
      'mongodb+srv://yinks:p%40ss%3Aword%2F1@cluster0.example.net/?retryWrites=true',
    );
    // the URI names no database, so the game uses its own
    expect(env.MONGODB_DB_NAME).toBe('campus_life');
  });

  it('explains a missing credential for a placeholder URI', () => {
    expect(() =>
      parseEnv({ MONGODB_URI: 'mongodb+srv://<USERNAME>:<PASSWORD>@cluster0.example.net/' }),
    ).toThrow(/DB_USERNAME: is required because MONGODB_URI contains <USERNAME>/);
  });
});

describe('Atlas-style URI placeholders and DNS servers', () => {
  it('fills <db_username>/<db_password> and parses DNS_SERVERS', () => {
    const env = parseEnv({
      MONGODB_URI: 'mongodb+srv://<db_username>:<db_password>@c.example.net/?appName=x',
      DB_USERNAME: 'yinks',
      DB_PASSWORD: 'a$b',
      DNS_SERVERS: '8.8.8.8, 1.1.1.1',
    });
    expect(buildDatabaseUri(env)).toBe('mongodb+srv://yinks:a%24b@c.example.net/?appName=x');
    expect(env.DNS_SERVERS).toEqual(['8.8.8.8', '1.1.1.1']);
  });

  it('rejects non-IP DNS servers', () => {
    expect(() => parseEnv({ DNS_SERVERS: 'dns.google' })).toThrow(/DNS_SERVERS/);
  });
});
