// A small in-memory cache for upstream answers, with three jobs:
//   1. Fresh: an answer younger than its time-to-live is served without asking upstream.
//   2. Stale fallback: when a refresh fails, an older answer (up to STALE_MAX_MS old) is
//      served instead, marked stale, so a short outage upstream does not blank the card.
//   3. Shared fetches: requests for a key whose fetch is already out wait for that one fetch,
//      so eight cards opening together never send the same call twice.
// It holds at most `maxEntries` answers and drops the oldest first. It empties on restart.

// The answer shape the routes send: data, when it was fetched, and whether it is stale.
import type { Upstream } from '../../shared/types.ts';

// How long an old answer may stand in for a failed refresh: 6 hours.
export const STALE_MAX_MS = 21_600_000;
// The default number of answers kept.
export const CACHE_MAX_ENTRIES = 500;

// One stored answer and the moment it was fetched, in milliseconds since 1970.
interface Entry {
  value: unknown;
  fetchedAt: number;
}

// What createCache needs: a clock, and optionally a smaller size for tests.
export interface CacheOptions {
  now: () => Date;
  maxEntries?: number;
}

// The cache the routes use.
export interface Cache {
  // The answer for `key`: from memory when younger than `ttlMs`, otherwise from `load`.
  get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Upstream<T>>;
  // How many answers are stored, for tests.
  readonly size: number;
}

// Builds an empty cache.
export function createCache({ now, maxEntries = CACHE_MAX_ENTRIES }: CacheOptions): Cache {
  // Stored answers. A Map keeps keys in insertion order, so the first key is the oldest.
  const entries = new Map<string, Entry>();
  // Fetches that are out right now, by key.
  const inFlight = new Map<string, Promise<Upstream<unknown>>>();

  // Turns a stored entry into the shape the routes send.
  function answer<T>(entry: Entry, stale: boolean): Upstream<T> {
    // `value` was stored by a load for this same key, so it has this key's type.
    return { data: entry.value as T, fetchedAt: new Date(entry.fetchedAt).toISOString(), stale };
  }

  // Stores an answer as the newest entry, dropping the oldest when over the limit.
  function store(key: string, entry: Entry): void {
    // Deleting first moves a refreshed key to the end of the insertion order.
    entries.delete(key);
    entries.set(key, entry);
    // The first key in the Map is the oldest one stored.
    if (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
  }

  // Fetches `key` once, storing the result, or falls back to the old entry on failure.
  async function refresh<T>(key: string, load: () => Promise<T>): Promise<Upstream<T>> {
    // The entry from before this fetch, if any, for the fallback.
    const previous = entries.get(key);
    try {
      // The real upstream call.
      const value = await load();
      // Stamped with the time the answer arrived.
      const entry: Entry = { value, fetchedAt: now().getTime() };
      store(key, entry);
      return answer<T>(entry, false);
    } catch (err) {
      // A failed refresh with an answer under 6 hours old serves that answer, marked stale.
      if (previous && now().getTime() - previous.fetchedAt <= STALE_MAX_MS) return answer<T>(previous, true);
      // Nothing usable: the route's error handler sends the failure.
      throw err;
    }
  }

  return {
    async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<Upstream<T>> {
      // A fresh answer is served from memory.
      const entry = entries.get(key);
      if (entry && now().getTime() - entry.fetchedAt < ttlMs) return answer<T>(entry, false);

      // A fetch for this key is already out: wait for it instead of sending another.
      const pending = inFlight.get(key);
      if (pending) return pending as Promise<Upstream<T>>;

      // Starts the fetch and records it, so requests arriving meanwhile share it.
      const fetching = refresh(key, load);
      inFlight.set(key, fetching);
      try {
        return await fetching;
      } finally {
        // Forgotten once it settles, whether it worked or not, so the next miss fetches anew.
        inFlight.delete(key);
      }
    },
    // A getter, so the count is read at the moment it is asked for.
    get size() {
      return entries.size;
    },
  };
}
