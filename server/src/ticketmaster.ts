// Ticketmaster's Discovery API: upcoming events near a point. It needs an API key, so the app
// builds this client only when TICKETMASTER_API_KEY is set; without it the events route
// answers 503 events_not_configured and weather carries on.
//
// The key travels in the query string, as Ticketmaster requires. It is never logged: getJson
// keeps the URL out of every message.

// Declares the shape of the answer.
import { z } from 'zod';
// The shared shape this file produces.
import type { EventItem } from '../../shared/types.ts';
// The checked GET with a time limit.
import { type FetchFn, UPSTREAM_TIMEOUT_MS, getJson } from './upstream.ts';

// The event search endpoint.
const EVENTS_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';

// The service's name in error messages.
const SERVICE = 'The events service';

// How far around the city to look, and how far ahead.
export const RADIUS_KM = 50;
export const DAYS_AHEAD = 14;
// At most this many events per card.
export const EVENTS_MAX = 6;

// One day in milliseconds, for the end of the search window.
const DAY_MS = 86_400_000;
// Ticketmaster wants times like 2026-11-23T12:00:00Z, without milliseconds. An ISO string's
// first 19 characters run up to the seconds.
const ISO_SECONDS_LENGTH = 19;
// "19:30:00" shortened to "19:30": the first 5 characters.
const HOURS_MINUTES_LENGTH = 5;

// One event, with only the fields a card shows. Venues and a start time are optional in
// Ticketmaster's data (a festival may have neither).
const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  dates: z.object({
    start: z.object({ localDate: z.string(), localTime: z.string().optional() }),
  }),
  _embedded: z.object({ venues: z.array(z.object({ name: z.string().optional() })).optional() }).optional(),
});

// The answer. With no events, Ticketmaster leaves `_embedded` out entirely.
const eventsAnswer = z.object({ _embedded: z.object({ events: z.array(eventSchema) }).optional() });

// What the events route calls.
export interface Ticketmaster {
  // Up to EVENTS_MAX events within RADIUS_KM of the point, from `now` to DAYS_AHEAD days on,
  // soonest first.
  eventsNear(latitude: number, longitude: number, now: Date): Promise<EventItem[]>;
}

// Options for the client. The key is required; the others have real defaults.
export interface TicketmasterOptions {
  apiKey: string;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

// A time in the format Ticketmaster accepts.
function ticketmasterTime(date: Date): string {
  return `${date.toISOString().slice(0, ISO_SECONDS_LENGTH)}Z`;
}

// Builds the client.
export function createTicketmaster({
  apiKey,
  fetchFn = fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
}: TicketmasterOptions): Ticketmaster {
  return {
    async eventsNear(latitude, longitude, now) {
      // The end of the search window.
      const until = new Date(now.getTime() + DAYS_AHEAD * DAY_MS);
      // URLSearchParams escapes every value, the key included.
      const params = new URLSearchParams({
        apikey: apiKey,
        latlong: `${latitude},${longitude}`,
        radius: String(RADIUS_KM),
        unit: 'km',
        size: String(EVENTS_MAX),
        sort: 'date,asc',
        startDateTime: ticketmasterTime(now),
        endDateTime: ticketmasterTime(until),
      });
      const answer = await getJson({
        fetchFn,
        url: `${EVENTS_URL}?${params}`,
        schema: eventsAnswer,
        service: SERVICE,
        timeoutMs,
      });
      // No events is an empty list, not an error.
      const events = answer._embedded?.events ?? [];
      // Each event in the shared shape; the first venue is the one shown.
      return events.map((event) => ({
        id: event.id,
        name: event.name,
        date: event.dates.start.localDate,
        time: event.dates.start.localTime?.slice(0, HOURS_MINUTES_LENGTH) ?? null,
        venue: event._embedded?.venues?.[0]?.name ?? null,
        url: event.url,
      }));
    },
  };
}
