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

// The weather for one place, in metric units; the client converts to °F when asked.
export interface Weather {
  current: {
    // Local time of the reading, ISO without an offset, in the place's own time zone.
    time: string;
    temperature: number;
    feelsLike: number;
    // WMO weather code; the client turns it into a label and an icon.
    code: number;
    isDay: boolean;
    windKmh: number;
  };
  // The next 12 hours, one entry per hour.
  hourly: Array<{ time: string; temperature: number; code: number; isDay: boolean }>;
  // Today and the next 6 days.
  daily: Array<{ date: string; high: number; low: number; code: number }>;
}

// One upcoming event near a place.
export interface EventItem {
  id: string;
  name: string;
  // Local date, and local time when the event has one.
  date: string;
  time: string | null;
  venue: string | null;
  // The event's Ticketmaster page.
  url: string;
}

// An upstream answer as our API sends it: the data, when it was fetched (ISO), and whether it
// is an old copy served because the latest fetch failed.
export interface Upstream<T> {
  data: T;
  fetchedAt: string;
  stale: boolean;
}
