// Shared set-up for the API tests: one connection to the test database, emptied before each
// test, a fresh app over it with a fixed clock, and fakes for everything upstream, so no test
// ever reaches Open-Meteo or Ticketmaster.

// Reads the recorded upstream answers.
import { readFileSync } from 'node:fs';
// Supertest sends HTTP requests straight to an Express app, without opening a port.
import request from 'supertest';
// The app under test, and the options a test may override.
import { type AppOptions, createApp } from '../src/app.ts';
// Makes the Prisma client.
import { type Db, createDb } from '../src/db.ts';
// The guarded test database address.
import { testDatabaseUrl } from './testDatabase.ts';
// Makes owners straight in the database, skipping the rate-limited route.
import { createOwner } from '../src/owners.ts';
// The header the key travels in.
import { OWNER_HEADER } from '../src/routes.ts';
// The sample type, for tests that pass their own.
import type { Sample } from '../src/samples.ts';
// The client types a fake must match.
import type { OpenMeteo } from '../src/openMeteo.ts';
import type { FetchFn } from '../src/upstream.ts';

// The HTTP status codes the tests expect, by name, so each check says what it means.
export const OK = 200;
export const CREATED = 201;
export const NO_CONTENT = 204;
export const BAD_REQUEST = 400;
export const UNAUTHORIZED = 401;
export const NOT_FOUND = 404;
export const CONFLICT = 409;
export const UNPROCESSABLE = 422;
export const TOO_MANY = 429;
export const SERVER_ERROR = 500;
export const BAD_GATEWAY = 502;
export const UNAVAILABLE = 503;

// The key header's name, re-exported so tests set it the same way the app reads it.
export const KEY = OWNER_HEADER;

// The moment every test runs at, unless it says otherwise: noon UTC on 23 November 2026.
export const NOW = new Date('2026-11-23T12:00:00Z');

// A clock a test moves by hand. `now` is what the code under test reads; `advance` moves it.
export function manualClock(start: Date = NOW) {
  // Held in a one-item list so the closures below share and change it.
  const time = [start.getTime()];
  return {
    now: () => new Date(time[0] ?? 0),
    advance: (ms: number) => {
      time[0] = (time[0] ?? 0) + ms;
    },
  };
}

// A recorded upstream answer from test/fixtures, parsed.
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

// A fake fetch. `respond` builds the answer for each URL; every URL asked for is kept in
// `calls`, so a test can check what would have been sent.
export function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchFn: FetchFn = async (input) => {
    // fetch accepts a string, a URL or a Request; the clients only ever pass a string.
    const url = String(input);
    calls.push(url);
    return respond(url);
  };
  return { fetchFn, calls };
}

// A JSON answer with a status, as a fake fetch returns it.
export function jsonResponse(body: unknown, status: number = OK): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// An Open-Meteo that fails the test if anything calls it. It is the default in makeApp, so a
// test that needs upstream data must pass its own fake.
export const noOpenMeteo: OpenMeteo = {
  searchPlaces: async () => {
    throw new Error('This test did not expect a place search');
  },
  forecast: async () => {
    throw new Error('This test did not expect a forecast');
  },
};

// One client per test file; opening a pool per test would be slow and use up connections.
export const db: Db = createDb(testDatabaseUrl());

// Empties every table and restarts the id counters, so each test sees ids from 1.
// CASCADE also clears the rows that point at the emptied tables.
export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe('TRUNCATE "Owner", "Favourite" RESTART IDENTITY CASCADE');
}

// Makes an owner and returns its key. No samples by default, so a test starts from nothing.
export function newOwner(samples: Sample[] = []): Promise<string> {
  return createOwner(db, NOW, samples);
}

// Builds a fresh app over the shared test database. `overrides` can swap any option.
export function makeApp(overrides: Partial<AppOptions> = {}) {
  // The fixed clock, the failing Open-Meteo and no Ticketmaster first, so a test's own
  // overrides still win and no test reaches the internet by accident.
  const app = createApp({ db, now: () => NOW, openMeteo: noOpenMeteo, ticketmaster: null, ...overrides });
  // `api` is a Supertest agent bound to this app.
  return { api: request(app), app };
}
