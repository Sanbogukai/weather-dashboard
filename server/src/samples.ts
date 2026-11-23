// The cities every new owner starts with, so the first visit shows a full dashboard instead of
// an empty page. The values live in samples.json and are Open-Meteo's own geocoding answers
// for each name, so a sample is exactly what a search would have saved.
//
// There is one of each card size, so the first visit shows what the sizes look like, and the
// order in the file is the order on the dashboard. Manila is also a city Ticketmaster does not
// cover, so the empty events state shows on first visit too.

// Declares the shape the file must have.
import { z } from 'zod';
// The sample data. A JSON import needs the `type: 'json'` attribute in Node.
import samplesFile from './samples.json' with { type: 'json' };
// The shapes a sample is made of.
import type { CardSize, Place } from '../../shared/types.ts';

// A sample favourite: a place and the card size it starts at.
export interface Sample extends Place {
  size: CardSize;
}

// One sample as the file must hold it. Checking it means a typo in the file fails at start-up,
// and turns the file's plain strings into the CardSize type.
const sampleSchema = z.object({
  placeId: z.number().int().positive(),
  name: z.string(),
  region: z.string().nullable(),
  country: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  size: z.enum(['SMALL', 'MEDIUM', 'LARGE']),
});

// The checked samples. `parse` throws on a bad file, which stops the server before it listens.
export const SAMPLES: Sample[] = z.array(sampleSchema).parse(samplesFile);
