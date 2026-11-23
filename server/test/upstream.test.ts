// The upstream clients on their own: recorded Open-Meteo answers and hand-written Ticketmaster
// answers map to the shared types, and every kind of failure becomes the right error code.
// A fake fetch stands in for the network.

// Vitest's test functions.
import { describe, expect, it } from 'vitest';
// The fakes and the recorded answers.
import { BAD_GATEWAY, NOW, SERVER_ERROR, TOO_MANY, fakeFetch, fixture, jsonResponse } from './helpers.ts';
// The code under test.
import { DAYS, HOURS, PLACES_MAX, createOpenMeteo } from '../src/openMeteo.ts';
import { EVENTS_MAX, RADIUS_KM, createTicketmaster } from '../src/ticketmaster.ts';
import { describeWeather } from '../src/weatherCodes.ts';
// The error type the clients throw.
import { ApiFailure } from '../src/errors.ts';
// The sample cities; Manila's is the first geocoding result word for word.
import { SAMPLES } from '../src/samples.ts';

// Manila, rounded as the routes round it.
const LAT = 14.6;
const LON = 120.98;
const TZ = 'Asia/Manila';
// A made-up key; the real one never appears in tests.
const FAKE_KEY = 'fake-ticketmaster-key-123';
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

describe('Ticketmaster', () => {
  it('maps an answer to events, with the search window and limits in the query', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('ticketmaster-events.json')));
    const events = await createTicketmaster({ apiKey: FAKE_KEY, fetchFn: fake.fetchFn }).eventsNear(LAT, LON, NOW);
    expect(events).toEqual([
      {
        id: 'vvG1fZ9fake001',
        name: 'Ottawa Senators vs. Toronto Maple Leafs',
        date: '2026-11-25',
        time: '19:00',
        venue: 'Canadian Tire Centre',
        url: 'https://www.ticketmaster.ca/event/fake001',
      },
      // No time and no venue: both null rather than missing.
      {
        id: 'vvG1fZ9fake002',
        name: 'Winter Lights Festival',
        date: '2026-11-28',
        time: null,
        venue: null,
        url: 'https://www.ticketmaster.ca/event/fake002',
      },
    ]);
    // The query: radius, count, soonest first, and a window from now to 14 days on.
    const url = new URL(fake.calls[0] ?? '');
    expect(url.searchParams.get('radius')).toBe(String(RADIUS_KM));
    expect(url.searchParams.get('size')).toBe(String(EVENTS_MAX));
    expect(url.searchParams.get('sort')).toBe('date,asc');
    expect(url.searchParams.get('startDateTime')).toBe('2026-11-23T12:00:00Z');
    expect(url.searchParams.get('endDateTime')).toBe('2026-12-07T12:00:00Z');
  });

  it('answers no events with an empty list', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('ticketmaster-none.json')));
    expect(await createTicketmaster({ apiKey: FAKE_KEY, fetchFn: fake.fetchFn }).eventsNear(LAT, LON, NOW)).toEqual(
      [],
    );
  });

  it('reports a 429 as upstream_quota, without the key in the message', async () => {
    const fake = fakeFetch(() => jsonResponse(fixture('ticketmaster-quota.json'), TOO_MANY));
    const failure = await failureOf(
      createTicketmaster({ apiKey: FAKE_KEY, fetchFn: fake.fetchFn }).eventsNear(LAT, LON, NOW),
    );
    expect(failure.code).toBe('upstream_quota');
    expect(failure.message).not.toContain(FAKE_KEY);
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
