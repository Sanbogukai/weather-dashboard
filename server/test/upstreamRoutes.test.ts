// The upstream-backed routes: /api/places, /api/weather and /api/holidays. The clients are
// fakes that count their calls, so these tests check what the routes add on top: input checks,
// rounding, the cache, the stale flag, the error shape, merging holidays with festivals, and
// the limit.

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
import { HOLIDAYS_MAX, WEATHER_TTL_MS } from '../src/routes.ts';
// The client types the fakes match.
import type { OpenMeteo } from '../src/openMeteo.ts';
import type { NagerDate } from '../src/nagerDate.ts';
import type { Wikidata } from '../src/wikidata.ts';
// The shapes the fakes return.
import type { Holiday, Place, Weather } from '../../shared/types.ts';

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
  countryCode: 'PH',
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
// A holiday and a festival for the fakes, the festival first by date.
const HOLIDAY: Holiday = {
  id: 'holiday:2026-11-30:Bonifacio Day',
  kind: 'holiday',
  name: 'Bonifacio Day',
  localName: 'Araw ni Gat Andres Bonifacio',
  date: '2026-11-30',
  endDate: null,
  regional: false,
  url: null,
  distanceKm: null,
};
const FESTIVAL: Holiday = {
  id: 'festival:Q1',
  kind: 'festival',
  name: 'A festival',
  localName: null,
  date: '2026-11-27',
  endDate: '2026-11-29',
  regional: false,
  url: 'https://x.test',
  distanceKm: 4,
};
// More holidays than a card shows, to check the cut.
const MANY_DAYS = 10;
// The first day of the month, padded to two digits for an ISO date.
const DAY_DIGITS = 2;

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

// A fake Nager.Date that records each country asked for and returns `holidays`.
function fakeNagerDate(holidays: Holiday[] = [HOLIDAY]) {
  const calls: string[] = [];
  const client: NagerDate = {
    nextHolidays: async (country) => {
      calls.push(country);
      return holidays;
    },
  };
  return { calls, client };
}

// A fake Wikidata that records each call's arguments, and fails while `failing` is set.
function fakeWikidata() {
  const state = { calls: [] as unknown[][], failing: false };
  const client: Wikidata = {
    festivalsNear: async (...args) => {
      state.calls.push(args);
      if (state.failing) throw new ApiFailure(BAD_GATEWAY, 'upstream_quota', 'The festivals service has had too many requests');
      return [FESTIVAL];
    },
  };
  return { state, client };
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

describe('GET /api/holidays', () => {
  it("merges the country's holidays with festivals at the rounded point, soonest first", async () => {
    const nagerDate = fakeNagerDate();
    const wikidata = fakeWikidata();
    const { api } = makeApp({ nagerDate: nagerDate.client, wikidata: wikidata.client });
    const res = await api.get(`/api/holidays?lat=${RAW_LAT}&lon=${RAW_LON}&country=PH`).set(KEY, await newOwner());
    expect(res.status).toBe(OK);
    expect(res.body).toEqual({ data: [FESTIVAL, HOLIDAY], fetchedAt: NOW.toISOString(), stale: false });
    expect(nagerDate.calls).toEqual(['PH']);
    expect(wikidata.state.calls).toEqual([[ROUNDED_LAT, ROUNDED_LON, NOW]]);
  });

  it('asks for holidays once per country, whatever the city', async () => {
    const nagerDate = fakeNagerDate();
    const { api } = makeApp({ nagerDate: nagerDate.client, wikidata: fakeWikidata().client });
    const key = await newOwner();
    await api.get(`/api/holidays?lat=${RAW_LAT}&lon=${RAW_LON}&country=PH`).set(KEY, key);
    // Another point in the same country.
    await api.get(`/api/holidays?lat=10&lon=124&country=PH`).set(KEY, key);
    expect(nagerDate.calls).toEqual(['PH']);
  });

  it('sends holidays alone when festivals fail', async () => {
    const wikidata = fakeWikidata();
    wikidata.state.failing = true;
    const { api } = makeApp({ nagerDate: fakeNagerDate().client, wikidata: wikidata.client });
    const res = await api.get(`/api/holidays?lat=${RAW_LAT}&lon=${RAW_LON}&country=PH`).set(KEY, await newOwner());
    expect(res.status).toBe(OK);
    expect(res.body.data).toEqual([HOLIDAY]);
  });

  it('fails with the upstream code when holidays fail', async () => {
    const failing: NagerDate = {
      nextHolidays: async () => {
        throw new ApiFailure(BAD_GATEWAY, 'upstream_timeout', 'The holidays service took too long');
      },
    };
    const { api } = makeApp({ nagerDate: failing, wikidata: fakeWikidata().client });
    const res = await api.get(`/api/holidays?lat=${RAW_LAT}&lon=${RAW_LON}&country=PH`).set(KEY, await newOwner());
    expect(res.status).toBe(BAD_GATEWAY);
    expect(res.body.error.code).toBe('upstream_timeout');
  });

  it('gives festivals only to a city saved without a country code', async () => {
    const nagerDate = fakeNagerDate();
    const { api } = makeApp({ nagerDate: nagerDate.client, wikidata: fakeWikidata().client });
    const res = await api.get(`/api/holidays?lat=${RAW_LAT}&lon=${RAW_LON}&country=`).set(KEY, await newOwner());
    expect(res.body.data).toEqual([FESTIVAL]);
    expect(nagerDate.calls).toEqual([]);
  });

  it(`cuts the list to ${HOLIDAYS_MAX}`, async () => {
    // Ten holidays on 1 to 10 December, plus the festival in November.
    const many = Array.from({ length: MANY_DAYS }, (_, index) => ({
      ...HOLIDAY,
      id: `holiday:${index}`,
      date: `2026-12-${String(index + 1).padStart(DAY_DIGITS, '0')}`,
    }));
    const { api } = makeApp({ nagerDate: fakeNagerDate(many).client, wikidata: fakeWikidata().client });
    const res = await api.get(`/api/holidays?lat=${RAW_LAT}&lon=${RAW_LON}&country=PH`).set(KEY, await newOwner());
    expect(res.body.data).toHaveLength(HOLIDAYS_MAX);
    expect(res.body.data[0]).toEqual(FESTIVAL);
  });

  // Lower case, three letters, a digit.
  it.each(['ph', 'PHL', 'P1'])('rejects the country %s', async (country) => {
    const { api } = makeApp();
    const res = await api.get(`/api/holidays?lat=0&lon=0&country=${country}`).set(KEY, await newOwner());
    expect(res.status).toBe(BAD_REQUEST);
  });
});
