// Open-Meteo: the city search (geocoding) and the forecast. Both are free and need no key.
// Each call's answer is checked with Zod and turned into the shared types, so nothing past
// this file knows Open-Meteo's own field names.

// Declares the shape of each answer.
import { z } from 'zod';
// The shared shapes this file produces.
import type { Place, Weather } from '../../shared/types.ts';
// The checked GET with a time limit.
import { type FetchFn, UPSTREAM_TIMEOUT_MS, getJson } from './upstream.ts';
// Code to label and icon.
import { describeWeather } from './weatherCodes.ts';

// The two endpoints.
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// The service's name in error messages.
const SERVICE = 'The weather service';

// At most this many city suggestions.
export const PLACES_MAX = 8;
// Hours in the hourly strip, and days in the daily list (today included).
export const HOURS = 12;
export const DAYS = 7;

// Open-Meteo marks day and night as 1 and 0.
const DAY_FLAG = 1;

// The fields asked for in each part of the forecast. Metric is Open-Meteo's default.
const CURRENT_FIELDS = 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m';
const HOURLY_FIELDS = 'temperature_2m,weather_code,is_day';
const DAILY_FIELDS = 'weather_code,temperature_2m_max,temperature_2m_min';

// One geocoding result. Small places can lack a country or a time zone; those are skipped,
// because a card needs both.
const geoResult = z.object({
  id: z.number().int(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(),
  admin1: z.string().optional(),
  timezone: z.string().optional(),
});

// The geocoding answer. With no match, Open-Meteo leaves `results` out entirely.
const geoAnswer = z.object({ results: z.array(geoResult).optional() });

// The forecast answer: one object for now, and parallel lists for the hours and the days.
const forecastAnswer = z.object({
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    weather_code: z.number().int(),
    is_day: z.number().int(),
    wind_speed_10m: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    weather_code: z.array(z.number().int()),
    is_day: z.array(z.number().int()),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number().int()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
  }),
})
  // The parallel lists must line up, one value per hour or day; otherwise the shape is wrong
  // and getJson reports it as an upstream_error.
  .refine(
    ({ hourly, daily }) =>
      [hourly.temperature_2m, hourly.weather_code, hourly.is_day].every((list) => list.length === hourly.time.length) &&
      [daily.weather_code, daily.temperature_2m_max, daily.temperature_2m_min].every(
        (list) => list.length === daily.time.length,
      ),
    'Forecast lists have different lengths',
  );

// What the routes call.
export interface OpenMeteo {
  // Up to PLACES_MAX cities whose name starts like `query`.
  searchPlaces(query: string): Promise<Place[]>;
  // The forecast at a point, in that place's local time.
  forecast(latitude: number, longitude: number, timezone: string): Promise<Weather>;
}

// Options for the client; both have real defaults.
export interface OpenMeteoOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

// Reads `list[index]`, which the schema check above guarantees for every index of `time`.
// noUncheckedIndexedAccess types it as possibly undefined, so this turns that into a clear
// upstream failure instead of a NaN on a card.
function at<T>(list: T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error('Forecast lists have different lengths');
  return value;
}

// Builds the client.
export function createOpenMeteo({ fetchFn = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS }: OpenMeteoOptions = {}): OpenMeteo {
  return {
    async searchPlaces(query) {
      // URLSearchParams escapes the query, so "São Paulo" or "a&b" travel safely.
      const params = new URLSearchParams({ name: query, count: String(PLACES_MAX), language: 'en', format: 'json' });
      const answer = await getJson({
        fetchFn,
        url: `${GEOCODING_URL}?${params}`,
        schema: geoAnswer,
        service: SERVICE,
        timeoutMs,
      });
      // No match is an empty list, not an error.
      const results = answer.results ?? [];
      // flatMap with [] drops the results a card cannot use, and maps the rest.
      return results.flatMap((result): Place[] =>
        result.country && result.timezone
          ? [
              {
                placeId: result.id,
                name: result.name,
                region: result.admin1 ?? null,
                country: result.country,
                latitude: result.latitude,
                longitude: result.longitude,
                timezone: result.timezone,
              },
            ]
          : [],
      );
    },

    async forecast(latitude, longitude, timezone) {
      // forecast_hours starts at the current hour, so the strip is always "from now".
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        timezone,
        current: CURRENT_FIELDS,
        hourly: HOURLY_FIELDS,
        daily: DAILY_FIELDS,
        forecast_hours: String(HOURS),
        forecast_days: String(DAYS),
      });
      const answer = await getJson({
        fetchFn,
        url: `${FORECAST_URL}?${params}`,
        schema: forecastAnswer,
        service: SERVICE,
        timeoutMs,
      });
      // Short names for the three parts.
      const { current, hourly, daily } = answer;
      // Open-Meteo's 1 and 0 become true and false.
      const currentIsDay = current.is_day === DAY_FLAG;
      return {
        current: {
          time: current.time,
          temperature: current.temperature_2m,
          feelsLike: current.apparent_temperature,
          isDay: currentIsDay,
          windKmh: current.wind_speed_10m,
          code: current.weather_code,
          ...describeWeather(current.weather_code, currentIsDay),
        },
        // One entry per hour, built from the same index of each parallel list.
        hourly: hourly.time.map((time, index) => {
          const code = at(hourly.weather_code, index);
          const isDay = at(hourly.is_day, index) === DAY_FLAG;
          return { time, temperature: at(hourly.temperature_2m, index), isDay, code, ...describeWeather(code, isDay) };
        }),
        // One entry per day; days have no hour, so they use the day icon.
        daily: daily.time.map((date, index) => {
          const code = at(daily.weather_code, index);
          return {
            date,
            high: at(daily.temperature_2m_max, index),
            low: at(daily.temperature_2m_min, index),
            code,
            ...describeWeather(code, true),
          };
        }),
      };
    },
  };
}
