// The upstream-backed routes: /api/places, /api/weather and /api/events. The clients are fakes
// that count their calls, so these tests check what the routes add on top: input checks,
// rounding, the cache, the stale flag, the error shape, the missing-key 503 and the limit.

// Vitest's test functions.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// Shared set-up.
import {
  BAD_GATEWAY,
  BAD_REQUEST,
  KEY,
  NOW,
  OK,
  TOO_MANY,
  UNAUTHORIZED,
  UNAVAILABLE,
  db,
  makeApp,
  manualClock,
  newOwner,
  resetDb,
} from './helpers.ts';
// The cache, built here so a test can share it with a hand-moved clock.
import { createCache } from '../src/cache.ts';
// The error the fakes throw for an upstream failure.
import { ApiFailure } from '../src/errors.ts';
// The cache lifetimes.
import { WEATHER_TTL_MS } from '../src/routes.ts';
// The client types the fakes match.
import type { OpenMeteo } from '../src/openMeteo.ts';
import type { Ticketmaster } from '../src/ticketmaster.ts';
// The shapes the fakes return.
import type { EventItem, Place, Weather } from '../../shared/types.ts';

// Each test starts from empty tables; the connection closes when the file is done.
beforeEach(resetDb);
afterAll(() => db.$disconnect());

// Coordinates with more decimals than the cache keeps, and the same point rounded.
const RAW_LAT = '14.60423';
const RAW_LON = '120.98221';
const ROUNDED_LAT = 14.6;
const ROUNDED_LON = 120.98;
// A second raw point that rounds to the same place.
const NEARBY_LAT = '14.601';
// An out-of-range latitude.
const BAD_LAT = '95';
// One request per minute, for the limit test.
const ONE = 1;

// A minimal place and weather for the fakes to return.
const PLACE: Place = {
  placeId: 1,
  name: 'Manila',
  region: null,
  country: 'Philippines',
  latitude: ROUNDED_LAT,
  longitude: ROUNDED_LON,
  timezone: 'Asia/Manila',
};
const WEATHER: Weather = {
  current: {
    time: '2026-11-23T20:00',
    temperature: 0,
    feelsLike: 0,
    code: 0,
    label: 'Clear sky',
    icon: 'clear-night',
    isDay: false,
    windKmh: 0,
  },
  hourly: [],
  daily: [],
};
const EVENT: EventItem = { id: 'e1', name: 'A concert', date: '2026-11-25', time: null, venue: null, url: 'https://x.test' };

// A fake Open-Meteo that records each call's arguments, and fails while `failing` is set.
function fakeOpenMeteo() {
  const state = { places: [] as string[], forecasts: [] as unknown[][], failing: false };
  const client: OpenMeteo = {
    searchPlaces: async (query) => {
      state.places.push(query);
      return [PLACE];
    },
    forecast: async (...args) => {
      state.forecasts.push(args);
      if (state.failing) throw new ApiFailure(BAD_GATEWAY, 'upstream_timeout', 'The weather service took too long');
      return WEATHER;
    },
  };
  return { state, client };
}

// A fake Ticketmaster that records each call's arguments.
function fakeTicketmaster() {
  const calls: unknown[][] = [];
  const client: Ticketmaster = {
    eventsNear: async (...args) => {
      calls.push(args);
      return [EVENT];
    },
  };
  return { calls, client };
}

describe('GET /api/places', () => {
  it('returns the suggestions, and asks upstream once per name', async () => {
    const openMeteo = fakeOpenMeteo();
    const { api } = makeApp({ openMeteo: openMeteo.client });
    const key = await newOwner();
    const res = await api.get('/api/places?q=Manila').set(KEY, key);
    expect(res.status).toBe(OK);
    expect(res.body).toEqual([PLACE]);
    // Another case, same name: served from the cache.
    await api.get('/api/places?q=manila').set(KEY, key);
    expect(openMeteo.state.places).toEqual(['Manila']);
  });

  it('answers 400 for a search under 2 letters', async () => {
    const { api } = makeApp();
    const res = await api.get('/api/places?q=M').set(KEY, await newOwner());
    expect(res.status).toBe(BAD_REQUEST);
    expect(res.body.error.issues[0].field).toBe('q');
  });

  it('needs the owner key', async () => {
    const { api } = makeApp();
    expect((await api.get('/api/places?q=Manila')).status).toBe(UNAUTHORIZED);
  });
});

describe('GET /api/weather', () => {
  it('rounds the point, so nearby requests share one cache entry', async () => {
    const openMeteo = fakeOpenMeteo();
    const { api } = makeApp({ openMeteo: openMeteo.client });
    const key = await newOwner();
    const res = await api.get(`/api/weather?lat=${RAW_LAT}&lon=${RAW_LON}&tz=Asia/Manila`).set(KEY, key);
    expect(res.status).toBe(OK);
    expect(res.body).toEqual({ data: WEATHER, fetchedAt: NOW.toISOString(), stale: false });
    await api.get(`/api/weather?lat=${NEARBY_LAT}&lon=${RAW_LON}&tz=Asia/Manila`).set(KEY, key);
    // One upstream call, with the rounded numbers.
    expect(openMeteo.state.forecasts).toEqual([[ROUNDED_LAT, ROUNDED_LON, 'Asia/Manila']]);
  });

  it('answers 400 for a bad point or time zone, naming each field', async () => {
    const { api } = makeApp();
    const res = await api.get(`/api/weather?lat=${BAD_LAT}&lon=abc&tz=Mars/Olympus`).set(KEY, await newOwner());
    expect(res.status).toBe(BAD_REQUEST);
    const fields = res.body.error.issues.map((issue: { field: string }) => issue.field);
    expect(fields).toEqual(['lat', 'lon', 'tz']);
  });

  it('serves the old answer marked stale when a refresh fails', async () => {
    const openMeteo = fakeOpenMeteo();
    const clock = manualClock();
    // The app and its cache read the same hand-moved clock.
    const { api } = makeApp({ openMeteo: openMeteo.client, now: clock.now, cache: createCache({ now: clock.now }) });
    const key = await newOwner();
    const url = `/api/weather?lat=${RAW_LAT}&lon=${RAW_LON}&tz=Asia/Manila`;
    await api.get(url).set(KEY, key);
    // Past the TTL, with upstream down.
    clock.advance(WEATHER_TTL_MS);
    openMeteo.state.failing = true;
    const res = await api.get(url).set(KEY, key);
    expect(res.status).toBe(OK);
    expect(res.body.stale).toBe(true);
    expect(res.body.fetchedAt).toBe(NOW.toISOString());
  });

  it('sends an upstream failure as 502 in the error shape when there is nothing to fall back on', async () => {
    const openMeteo = fakeOpenMeteo();
    openMeteo.state.failing = true;
    const { api } = makeApp({ openMeteo: openMeteo.client });
    const res = await api.get(`/api/weather?lat=${RAW_LAT}&lon=${RAW_LON}&tz=Asia/Manila`).set(KEY, await newOwner());
    expect(res.status).toBe(BAD_GATEWAY);
    expect(res.body.error.code).toBe('upstream_timeout');
  });

  it('answers 429 past the per-owner limit', async () => {
    const { api } = makeApp({ openMeteo: fakeOpenMeteo().client, upstreamLimit: ONE });
    const key = await newOwner();
    const url = `/api/weather?lat=${RAW_LAT}&lon=${RAW_LON}&tz=Asia/Manila`;
    expect((await api.get(url).set(KEY, key)).status).toBe(OK);
    expect((await api.get(url).set(KEY, key)).status).toBe(TOO_MANY);
    // Another owner has an allowance of its own.
    expect((await api.get(url).set(KEY, await newOwner())).status).toBe(OK);
  });
});

describe('GET /api/events', () => {
  it('answers 503 events_not_configured without a key', async () => {
    const { api } = makeApp({ ticketmaster: null });
    const res = await api.get(`/api/events?lat=${RAW_LAT}&lon=${RAW_LON}`).set(KEY, await newOwner());
    expect(res.status).toBe(UNAVAILABLE);
    expect(res.body.error.code).toBe('events_not_configured');
  });

  it('still checks the input first without a key', async () => {
    const { api } = makeApp({ ticketmaster: null });
    expect((await api.get(`/api/events?lat=${BAD_LAT}&lon=0`).set(KEY, await newOwner())).status).toBe(BAD_REQUEST);
  });

  it('returns events at the rounded point, searching from now', async () => {
    const ticketmaster = fakeTicketmaster();
    const { api } = makeApp({ ticketmaster: ticketmaster.client });
    const res = await api.get(`/api/events?lat=${RAW_LAT}&lon=${RAW_LON}`).set(KEY, await newOwner());
    expect(res.status).toBe(OK);
    expect(res.body).toEqual({ data: [EVENT], fetchedAt: NOW.toISOString(), stale: false });
    expect(ticketmaster.calls).toEqual([[ROUNDED_LAT, ROUNDED_LON, NOW]]);
  });
});
