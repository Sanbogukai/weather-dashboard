// The environment check: what start-up accepts, what it refuses, and that a refusal never
// prints a secret. No database needed; loadEnv is given its own fake environment.

// describe groups tests; it defines one; expect checks a value.
import { describe, expect, it } from 'vitest';
// The function under test.
import { loadEnv } from '../src/env.ts';

// A valid local database URL, used as the base of each case.
const DB = 'postgresql://user:pass@localhost:5432/weather_dev';
// The port used when PORT is not set.
const DEFAULT_PORT = 3000;
// A port as Render might set it, and the same port as environment text.
const RENDER_PORT = 10000;
const RENDER_PORT_TEXT = '10000';

describe('loadEnv', () => {
  it('accepts the minimum and fills in the defaults', () => {
    const env = loadEnv({ DATABASE_URL: DB });
    expect(env).toEqual({ DATABASE_URL: DB, PORT: DEFAULT_PORT });
  });

  it('treats empty values as unset, as a copied .env.example leaves them', () => {
    const env = loadEnv({ DATABASE_URL: DB, DIRECT_URL: '', PORT: '' });
    expect(env.DIRECT_URL).toBeUndefined();
    expect(env.PORT).toBe(DEFAULT_PORT);
  });

  it('reads the optional values when they are set', () => {
    const env = loadEnv({ DATABASE_URL: DB, DIRECT_URL: DB, PORT: RENDER_PORT_TEXT });
    expect(env.DIRECT_URL).toBe(DB);
    // Text from the environment becomes a number.
    expect(env.PORT).toBe(RENDER_PORT);
  });

  it('refuses a missing DATABASE_URL and names it', () => {
    expect(() => loadEnv({})).toThrow('DATABASE_URL is not set');
  });

  it('refuses a URL that is not PostgreSQL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/weather' })).toThrow(
      'DATABASE_URL must start with postgresql://',
    );
  });

  it('refuses a bad port', () => {
    expect(() => loadEnv({ DATABASE_URL: DB, PORT: '99999' })).toThrow('PORT');
  });

  it('names every bad variable at once, without printing any value', () => {
    // A DIRECT_URL with a password in it, pasted wrongly: the error must not echo it.
    const secretish = 'not-a-url-with-secret-p4ss';
    try {
      loadEnv({ DIRECT_URL: secretish, PORT: 'abc' });
      // Reaching this line means nothing was thrown, which is a failure.
      expect.unreachable('loadEnv should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('DIRECT_URL');
      expect(message).toContain('PORT');
      expect(message).not.toContain(secretish);
    }
  });
});
