// The shapes the client and the server agree on. Both sides load this file with `import type`,
// so it disappears when the code runs and only the type checker reads it.

// Every error the API sends. `code` is stable and the client picks its message from it;
// `message` is for people reading the response; `issues` lists bad fields on a 400.
export interface ApiError {
  error: {
    code: string;
    message: string;
    issues?: Issue[];
  };
}

// One problem with one field of a request, such as { field: 'size', message: 'Pick S, M or L' }.
export interface Issue {
  field: string;
  message: string;
}

// A city from the search suggestions (Open-Meteo geocoding).
export interface Place {
  // Open-Meteo's id for the place; one favourite per id per owner.
  placeId: number;
  name: string;
  // State or province, when the geocoder has one.
  region: string | null;
  country: string;
  // ISO 3166-1 alpha-2, such as "PH", for the holidays lookup. "" on cities saved before the
  // code was stored.
  countryCode: string;
  latitude: number;
  longitude: number;
  // IANA time zone, such as "Asia/Manila", for local times on the card.
  timezone: string;
}

// How much room a card takes on the dashboard.
export type CardSize = 'SMALL' | 'MEDIUM' | 'LARGE';

// A saved city, as the API returns it.
export interface Favourite extends Place {
  id: number;
  size: CardSize;
  // Order on the dashboard, 0 first.
  position: number;
}

// The icon the client draws for a weather code. Clear and partly cloudy have a night version.
export type WeatherIcon =
  | 'clear-day'
  | 'clear-night'
  | 'partly-cloudy-day'
  | 'partly-cloudy-night'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

// The conditions part of every weather entry: the WMO code Open-Meteo sent, and the label and
// icon the server's weatherCodes.ts gives it.
export interface Conditions {
  code: number;
  label: string;
  icon: WeatherIcon;
}

// The weather for one place, in metric units; the client converts to °F when asked.
export interface Weather {
  current: Conditions & {
    // Local time of the reading, ISO without an offset, in the place's own time zone.
    time: string;
    temperature: number;
    feelsLike: number;
    isDay: boolean;
    windKmh: number;
  };
  // The next 12 hours, one entry per hour.
  hourly: Array<Conditions & { time: string; temperature: number; isDay: boolean }>;
  // Today and the next 6 days.
  daily: Array<Conditions & { date: string; high: number; low: number }>;
}

// What a dated entry on the card is: a public holiday in the city's country, or a festival
// near the city.
export type HolidayKind = 'holiday' | 'festival';

// One upcoming holiday or festival.
export interface Holiday {
  id: string;
  kind: HolidayKind;
  // The English name.
  name: string;
  // The name in the country's language, when it differs, such as "Araw ng Pasko".
  localName: string | null;
  // The first day, YYYY-MM-DD, and the last day for a festival that runs several days.
  date: string;
  endDate: string | null;
  // A holiday kept only in some states or provinces; always false for a festival.
  regional: boolean;
  // A page about it (Wikipedia, else Wikidata) for a festival; null for a holiday.
  url: string | null;
  // How far the festival is from the city, rounded to whole kilometres; null for a holiday.
  distanceKm: number | null;
}

// An upstream answer as our API sends it: the data, when it was fetched (ISO), and whether it
// is an old copy served because the latest fetch failed.
export interface Upstream<T> {
  data: T;
  fetchedAt: string;
  stale: boolean;
}
