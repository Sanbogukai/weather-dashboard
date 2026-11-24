// Wikidata: festivals near a point, from its public SPARQL endpoint. It is free and needs no
// key, but it asks every client to send a User-Agent that says who is calling, and it is slow
// and rate-limited, so the route caches the answer for a day and shows holidays alone when
// this fails.
//
// Wikidata only knows a festival's date when someone has entered a dated edition, such as
// "Sapporo Snow Festival 2027", so many cities get none. That is an empty list, not an error.

// Declares the shape of the answer.
import { z } from 'zod';
// The shared shape this file produces.
import type { Holiday } from '../../shared/types.ts';
// The checked GET with a time limit.
import { type FetchFn, getJson } from './upstream.ts';

// The query service.
const SPARQL_URL = 'https://query.wikidata.org/sparql';

// Who is calling, as Wikidata's User-Agent policy asks: the app's name and where to find it.
const USER_AGENT = 'weather-dashboard/1.0 (https://github.com/Sanbogukai/weather-dashboard)';

// The service's name in error messages.
const SERVICE = 'The festivals service';

// How far around the city to look, and how far ahead.
export const FESTIVAL_RADIUS_KM = 50;
export const FESTIVAL_DAYS_AHEAD = 365;
// At most this many festivals per card.
export const FESTIVALS_MAX = 6;
// Rows asked for: twice the festivals shown, because a festival with two dates comes back as
// two rows and the copies are dropped here.
const ROWS_PER_FESTIVAL = 2;
const ROWS_MAX = FESTIVALS_MAX * ROWS_PER_FESTIVAL;
// Wikidata's queries take a few seconds; give them 10 rather than the usual 5.
export const WIKIDATA_TIMEOUT_MS = 10_000;

// One day in milliseconds, for the end of the search window.
const DAY_MS = 86_400_000;
// "2026-11-24T00:00:00Z" shortened to "2026-11-24": the first 10 characters.
const DATE_LENGTH = 10;
// Wikidata's id for "festival"; the query also takes its kinds, such as "music festival".
const FESTIVAL_CLASS = 'wd:Q132241';

// One value in a result row, as SPARQL JSON gives it.
const cell = z.object({ value: z.string() });

// One row: the item, its label, when it starts (and ends), how far it is, and its English
// Wikipedia article when there is one.
const row = z.object({
  item: cell,
  itemLabel: cell,
  start: cell,
  end: cell.optional(),
  dist: cell,
  article: cell.optional(),
});

// The answer.
const sparqlAnswer = z.object({ results: z.object({ bindings: z.array(row) }) });

// What the holidays route calls.
export interface Wikidata {
  // Up to FESTIVALS_MAX festivals within FESTIVAL_RADIUS_KM of the point that start from `now`
  // to FESTIVAL_DAYS_AHEAD days on, soonest first.
  festivalsNear(latitude: number, longitude: number, now: Date): Promise<Holiday[]>;
}

// Options for the client; both have real defaults.
export interface WikidataOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

// The query. Every value put in is a number or a date made here, never text from a visitor.
// A festival's start is its "start time" (P580), or its "point in time" (P585) for a one-day
// one; its place is "coordinate location" (P625).
export function festivalQuery(latitude: number, longitude: number, from: string, until: string): string {
  return `SELECT ?item ?itemLabel ?start ?end ?dist ?article WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?location .
    bd:serviceParam wikibase:center "Point(${longitude} ${latitude})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${FESTIVAL_RADIUS_KM}" .
    bd:serviceParam wikibase:distance ?dist .
  }
  ?item wdt:P31/wdt:P279* ${FESTIVAL_CLASS} .
  { ?item wdt:P580 ?start . OPTIONAL { ?item wdt:P582 ?end } } UNION { ?item wdt:P585 ?start }
  FILTER(?start >= "${from}T00:00:00Z"^^xsd:dateTime && ?start < "${until}T00:00:00Z"^^xsd:dateTime)
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
} ORDER BY ?start LIMIT ${ROWS_MAX}`;
}

// A date and time from Wikidata as a plain date.
function dateOnly(value: string): string {
  return value.slice(0, DATE_LENGTH);
}

// Builds the client.
export function createWikidata({ fetchFn = fetch, timeoutMs = WIKIDATA_TIMEOUT_MS }: WikidataOptions = {}): Wikidata {
  return {
    async festivalsNear(latitude, longitude, now) {
      // The search window, as dates.
      const from = dateOnly(now.toISOString());
      const until = dateOnly(new Date(now.getTime() + FESTIVAL_DAYS_AHEAD * DAY_MS).toISOString());
      // URLSearchParams escapes the query text.
      const params = new URLSearchParams({ query: festivalQuery(latitude, longitude, from, until), format: 'json' });
      const answer = await getJson({
        fetchFn,
        url: `${SPARQL_URL}?${params}`,
        schema: sparqlAnswer,
        service: SERVICE,
        timeoutMs,
        headers: { 'User-Agent': USER_AGENT },
      });
      // A festival with two start values comes back as two rows; the rows are sorted by start,
      // so keeping the first row per item keeps its earliest date.
      const seen = new Set<string>();
      const firsts = answer.results.bindings.filter((result) => {
        if (seen.has(result.item.value)) return false;
        seen.add(result.item.value);
        return true;
      });
      // Each festival in the shared shape.
      return firsts.slice(0, FESTIVALS_MAX).map((result) => ({
        id: `festival:${result.item.value}`,
        kind: 'festival' as const,
        name: result.itemLabel.value,
        localName: null,
        date: dateOnly(result.start.value),
        endDate: result.end ? dateOnly(result.end.value) : null,
        regional: false,
        // The Wikipedia article when there is one, else the Wikidata page itself.
        url: result.article?.value ?? result.item.value,
        distanceKm: Math.round(Number(result.dist.value)),
      }));
    },
  };
}
