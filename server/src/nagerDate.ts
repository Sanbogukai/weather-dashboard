// Nager.Date: public holidays by country. It is free and needs no key. It covers about 120
// countries; for the rest it answers 204 No Content, which becomes an empty list here, so the
// card says holidays are not available rather than showing an error.

// Declares the shape of the answer.
import { z } from 'zod';
// The shared shape this file produces.
import type { Holiday } from '../../shared/types.ts';
// The checked GET with a time limit.
import { type FetchFn, UPSTREAM_TIMEOUT_MS, getJson } from './upstream.ts';

// The next holidays in a country, for the coming 365 days. The country code goes on the end.
const NEXT_HOLIDAYS_URL = 'https://date.nager.at/api/v3/NextPublicHolidays/';

// The service's name in error messages.
const SERVICE = 'The holidays service';

// One holiday, with only the fields a card shows. `counties` lists the regions (such as
// "CA-ON") when the holiday is not nationwide; `global` is false then.
const holidaySchema = z.object({
  date: z.string(),
  localName: z.string(),
  name: z.string(),
  global: z.boolean(),
  counties: z.array(z.string()).nullable(),
});

// The answer: a list, soonest first.
const holidaysAnswer = z.array(holidaySchema);

// What the holidays route calls.
export interface NagerDate {
  // The country's public holidays from today on, soonest first.
  nextHolidays(countryCode: string): Promise<Holiday[]>;
}

// Options for the client; both have real defaults.
export interface NagerDateOptions {
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

// Builds the client.
export function createNagerDate({ fetchFn = fetch, timeoutMs = UPSTREAM_TIMEOUT_MS }: NagerDateOptions = {}): NagerDate {
  return {
    async nextHolidays(countryCode) {
      const holidays = await getJson({
        fetchFn,
        // The route only passes two capital letters, so the code needs no escaping.
        url: `${NEXT_HOLIDAYS_URL}${countryCode}`,
        schema: holidaysAnswer,
        service: SERVICE,
        timeoutMs,
        // A country the service does not cover: no holidays, not an error.
        noContent: [],
      });
      // Each holiday in the shared shape. Two holidays can share a date (Christmas Eve and a
      // regional one), so the id joins the date and the English name.
      return holidays.map((holiday) => ({
        id: `holiday:${holiday.date}:${holiday.name}`,
        kind: 'holiday' as const,
        name: holiday.name,
        // The local name only when it adds something, such as "Araw ng Pasko".
        localName: holiday.localName === holiday.name ? null : holiday.localName,
        date: holiday.date,
        endDate: null,
        regional: !holiday.global,
        url: null,
        distanceKm: null,
      }));
    },
  };
}
