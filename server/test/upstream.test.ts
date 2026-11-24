// The upstream clients on their own: recorded Open-Meteo, Nager.Date and Wikidata answers
// map to the shared types, and every kind of failure becomes the right error code.
// A fake fetch stands in for the network.

// Vitest's test functions.
import { describe, expect, it } from 'vitest';
// The fakes and the recorded answers.
import { BAD_GATEWAY, NOW, NO_CONTENT, SERVER_ERROR, TOO_MANY, fakeFetch, fixture, jsonResponse } from './helpers.ts';
// The code under test.
import { DAYS, HOURS, PLACES_MAX, createOpenMeteo } from '../src/openMeteo.ts';
import { createNagerDate } from '../src/nagerDate.ts';
import { FESTIVALS_MAX, FESTIVAL_RADIUS_KM, createWikidata } from '../src/wikidata.ts';
import { describeWeather } from '../src/weatherCodes.ts';
// The error type the clients throw.
import { ApiFailure } from '../src/errors.ts';
// The sample cities; Manila's is the first geocoding result word for word.
import { SAMPLES } from '../src/samples.ts';

// Manila, rounded as the routes round it.
const LAT = 14.6;
const LON = 120.98;
const TZ = 'Asia/Manila';
// A time limit short enough for a test to wait it out.
const SHORT_TIMEOUT_MS = 20;
// Comfortably longer than that limit.
const SLOW_MS = 1000;
// The recorded forecast, with the fields the mapping tests compare against.
const FORECAST = fixture('forecast-manila.json') as {
  current: { temperature_2m: number; apparent_temperature: number; wind_speed_10m: number; weather_code: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
};
// Results a test removes from the recorded search answer.
const REMOVED = 2;

// Two WMO codes the tests look up by name: clear sky, and one no table has.
const CLEAR_SKY = 0;
const MADE_UP_CODE = 42;

// The ApiFailure a promise rejects with, so a test can check its code.
async function failureOf(promise: Promise<unknown>): Promise<ApiFailure> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiFailure) return err;
    throw err;
  }
  throw new Error('Expected the call to fail');
}

describe('Open-Meteo place search', () => {
  it('maps a recorded answer to places', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('geocoding-manila.json')));
    const places = await createOpenMeteo({ fetchFn: fake.fetchFn }).searchPlaces('Manila');
    expect(places).toHaveLength(PLACES_MAX);
    // The first result is the Manila sample, without the sample's card size.
    const { size: _size, ...manila } = SAMPLES[0] ?? {};
    expect(places[0]).toEqual(manila);
    // The search text and the count went into the query string.
    expect(fake.calls[0]).toContain('name=Manila');
    expect(fake.calls[0]).toContain(`count=${PLACES_MAX}`);
  });

  it('answers no match with an empty list', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('geocoding-none.json')));
    expect(await createOpenMeteo({ fetchFn: fake.fetchFn }).searchPlaces('zzqxv')).toEqual([]);
  });

  it('skips results without a time zone or a country', async () => {
    const answer = fixture('geocoding-manila.json') as { results: Array<Record<string, unknown>> };
    // The first result loses its time zone, the second its country.
    const [first, second] = answer.results;
    delete first?.timezone;
    delete second?.country;
    const fake = fakeFetch(() => jsonResponse(answer));
    const places = await createOpenMeteo({ fetchFn: fake.fetchFn }).searchPlaces('Manila');
    expect(places).toHaveLength(answer.results.length - REMOVED);
  });
});

describe('Open-Meteo forecast', () => {
  it('maps a recorded answer to the Weather shape', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('forecast-manila.json')));
    const weather = await createOpenMeteo({ fetchFn: fake.fetchFn }).forecast(LAT, LON, TZ);
    expect(weather.hourly).toHaveLength(HOURS);
    expect(weather.daily).toHaveLength(DAYS);
    // The recorded reading, under our names; it was recorded in daytime.
    const { current, daily } = FORECAST;
    expect(weather.current).toMatchObject({
      time: '2026-11-23T13:30',
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      code: current.weather_code,
      ...describeWeather(current.weather_code, true),
      isDay: true,
      windKmh: current.wind_speed_10m,
    });
    // Today, built from the first entry of each daily list.
    expect(weather.daily[0]).toEqual({
      date: daily.time[0],
      high: daily.temperature_2m_max[0],
      low: daily.temperature_2m_min[0],
      code: daily.weather_code[0],
      ...describeWeather(daily.weather_code[0] ?? CLEAR_SKY, true),
    });
    // The place's time zone went into the query string.
    expect(fake.calls[0]).toContain('timezone=Asia%2FManila');
  });

  it('reports a changed shape as upstream_error', async () => {
    // A field renamed upstream.
    const answer = fixture('forecast-manila.json') as { current: Record<string, unknown> };
    answer.current.temp = answer.current.temperature_2m;
    delete answer.current.temperature_2m;
    const fake = fakeFetch(() => jsonResponse(answer));
    const failure = await failureOf(createOpenMeteo({ fetchFn: fake.fetchFn }).forecast(LAT, LON, TZ));
    expect(failure.status).toBe(BAD_GATEWAY);
    expect(failure.code).toBe('upstream_error');
  });

  it('reports lists of different lengths as upstream_error', async () => {
    const answer = fixture('forecast-manila.json') as { hourly: { is_day: number[] } };
    answer.hourly.is_day.pop();
    const fake = fakeFetch(() => jsonResponse(answer));
    expect((await failureOf(createOpenMeteo({ fetchFn: fake.fetchFn }).forecast(LAT, LON, TZ))).code).toBe(
      'upstream_error',
    );
  });
});

describe('getJson failures', () => {
  it('reports a slow answer as upstream_timeout', async () => {
    // A fetch that answers only after SLOW_MS, or gives up when the signal fires.
    const slowFetch: typeof fetch = (_url, init) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(jsonResponse({})), SLOW_MS);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(init.signal?.reason);
        });
      });
    const client = createOpenMeteo({ fetchFn: slowFetch, timeoutMs: SHORT_TIMEOUT_MS });
    expect((await failureOf(client.searchPlaces('Manila'))).code).toBe('upstream_timeout');
  });

  it('reports no connection as upstream_error', async () => {
    const fake = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    expect((await failureOf(createOpenMeteo({ fetchFn: fake.fetchFn }).searchPlaces('Manila'))).code).toBe(
      'upstream_error',
    );
  });

  it('reports a 500 as upstream_error', async () => {
    const fake = fakeFetch(() => jsonResponse({ error: true }, SERVER_ERROR));
    expect((await failureOf(createOpenMeteo({ fetchFn: fake.fetchFn }).searchPlaces('Manila'))).code).toBe(
      'upstream_error',
    );
  });

  it('reports a body that is not JSON as upstream_error', async () => {
    const fake = fakeFetch(() => new Response('<html>busy</html>'));
    expect((await failureOf(createOpenMeteo({ fetchFn: fake.fetchFn }).searchPlaces('Manila'))).code).toBe(
      'upstream_error',
    );
  });
});

describe('Nager.Date holidays', () => {
  it('maps a recorded answer to holidays, marking regional ones', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('nager-canada.json')));
    const holidays = await createNagerDate({ fetchFn: fake.fetchFn }).nextHolidays('CA');
    // The country code goes on the end of the address.
    expect(fake.calls[0]).toBe('https://date.nager.at/api/v3/NextPublicHolidays/CA');
    // Christmas is nationwide and its local name is the same, so there is none to show.
    expect(holidays[0]).toEqual({
      id: 'holiday:2026-12-25:Christmas Day',
      kind: 'holiday',
      name: 'Christmas Day',
      localName: null,
      date: '2026-12-25',
      endDate: null,
      regional: false,
      url: null,
      distanceKm: null,
    });
    // Boxing Day is kept in some provinces only, and its local name differs from the English one.
    expect(holidays[1]).toMatchObject({ name: "St. Stephen's Day", localName: 'Boxing Day', regional: true });
  });

  it('answers a country it does not cover (204) with an empty list', async () => {
    const fake = fakeFetch(() => new Response(null, { status: NO_CONTENT }));
    expect(await createNagerDate({ fetchFn: fake.fetchFn }).nextHolidays('IN')).toEqual([]);
  });

  it('reports a 429 as upstream_quota', async () => {
    const fake = fakeFetch(() => jsonResponse({}, TOO_MANY));
    expect((await failureOf(createNagerDate({ fetchFn: fake.fetchFn }).nextHolidays('CA'))).code).toBe('upstream_quota');
  });
});

describe('Wikidata festivals', () => {
  it('maps a recorded answer to festivals, one per item, soonest first', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('wikidata-festivals.json')));
    const festivals = await createWikidata({ fetchFn: fake.fetchFn }).festivalsNear(LAT, LON, NOW);
    expect(festivals.length).toBeGreaterThan(0);
    expect(festivals.length).toBeLessThanOrEqual(FESTIVALS_MAX);
    // Every festival is within the radius, has a page, and is not marked regional.
    expect(festivals.every((festival) => festival.kind === 'festival' && festival.url !== null && !festival.regional)).toBe(true);
    expect(festivals.every((festival) => (festival.distanceKm ?? Infinity) <= FESTIVAL_RADIUS_KM)).toBe(true);
    // No item twice.
    expect(new Set(festivals.map((festival) => festival.id)).size).toBe(festivals.length);
    // Sorted by date, as the query asks.
    expect(festivals.map((festival) => festival.date)).toEqual(festivals.map((festival) => festival.date).toSorted());
    // The query names the point and the window, and the call says who is asking.
    const url = new URL(fake.calls[0] ?? '');
    expect(url.searchParams.get('query')).toContain(`Point(${LON} ${LAT})`);
    expect(url.searchParams.get('query')).toContain('2026-11-23T00:00:00Z');
    expect(fake.headers[0]?.['User-Agent']).toContain('weather-dashboard');
  });

  it('answers no rows with an empty list', async () => {
    const fake = fakeFetch(() => jsonResponse({ results: { bindings: [] } }));
    expect(await createWikidata({ fetchFn: fake.fetchFn }).festivalsNear(LAT, LON, NOW)).toEqual([]);
  });

  it('keeps the earliest row when a festival comes back twice', async () => {
    // Two rows for one item, sorted by start as the query returns them.
    const twice = (start: string) => ({
      item: { value: 'http://www.wikidata.org/entity/Q1' },
      itemLabel: { value: 'Test Fair' },
      start: { value: start },
      dist: { value: '3.4' },
    });
    const fake = fakeFetch(() => jsonResponse({ results: { bindings: [twice('2026-12-01T00:00:00Z'), twice('2026-12-05T00:00:00Z')] } }));
    const festivals = await createWikidata({ fetchFn: fake.fetchFn }).festivalsNear(LAT, LON, NOW);
    // One festival, its first date, the distance rounded, and the Wikidata page as its link.
    expect(festivals).toEqual([
      {
        id: 'festival:http://www.wikidata.org/entity/Q1',
        kind: 'festival',
        name: 'Test Fair',
        localName: null,
        date: '2026-12-01',
        endDate: null,
        regional: false,
        url: 'http://www.wikidata.org/entity/Q1',
        distanceKm: 3,
      },
    ]);
  });

  it('reports a 429 as upstream_quota', async () => {
    const fake = fakeFetch(() => jsonResponse({}, TOO_MANY));
    expect((await failureOf(createWikidata({ fetchFn: fake.fetchFn }).festivalsNear(LAT, LON, NOW))).code).toBe(
      'upstream_quota',
    );
  });
});

describe('describeWeather', () => {
  it('picks the sun or the moon for clear skies', () => {
    expect(describeWeather(CLEAR_SKY, true).icon).toBe('clear-day');
    expect(describeWeather(CLEAR_SKY, false).icon).toBe('clear-night');
  });

  it('gives an unknown code a plain cloud', () => {
    expect(describeWeather(MADE_UP_CODE, true)).toEqual({ label: 'Unknown conditions', icon: 'cloudy' });
  });
});
