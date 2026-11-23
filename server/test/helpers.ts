// Shared set-up for the API tests: one connection to the test database, emptied before each
// test, and a fresh app over it.

// Supertest sends HTTP requests straight to an Express app, without opening a port.
import request from 'supertest';
// The app under test, and the options a test may override.
import { type AppOptions, createApp } from '../src/app.ts';
// Makes the Prisma client.
import { type Db, createDb } from '../src/db.ts';
// The guarded test database address.
import { testDatabaseUrl } from './testDatabase.ts';

// The HTTP status codes the tests expect, by name, so each check says what it means.
export const OK = 200;
export const BAD_REQUEST = 400;
export const NOT_FOUND = 404;

// One client per test file; opening a pool per test would be slow and use up connections.
export const db: Db = createDb(testDatabaseUrl());

// Empties every table and restarts the id counters, so each test sees ids from 1.
// CASCADE also clears the rows that point at the emptied tables.
export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe('TRUNCATE "Owner", "Favourite" RESTART IDENTITY CASCADE');
}

// Builds a fresh app over the shared test database. `overrides` can swap any option.
export function makeApp(overrides: Partial<AppOptions> = {}) {
  // The test database first, so a test's own overrides still win.
  const app = createApp({ db, ...overrides });
  // `api` is a Supertest agent bound to this app.
  return { api: request(app), app };
}
