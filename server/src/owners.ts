// Owners: one per browser. Creating one copies the sample cities in; every other request finds
// the owner by the key the browser sends; owners unseen for 30 days are removed.

// Makes the random key; a version 4 UUID has 122 random bits, too many to guess.
import { randomUUID } from 'node:crypto';
// The database client type.
import type { Db } from './db.ts';
// The cities a new owner starts with.
import { SAMPLES, type Sample } from './samples.ts';

// Lengths of time, in milliseconds.
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
// Owners not seen for this many days are deleted with everything they saved.
export const STALE_DAYS = 30;

// The moment `days` days before `from`.
function daysBefore(from: Date, days: number): Date {
  // Dates are compared as milliseconds since 1970, so the subtraction is plain arithmetic.
  return new Date(from.getTime() - days * DAY_MS);
}

// Makes an owner holding a copy of `samples` and returns its key. Tests pass an empty list to
// start from nothing.
export async function createOwner(db: Db, now: Date, samples: Sample[] = SAMPLES): Promise<string> {
  // The key the browser will keep and send back with every request.
  const key = randomUUID();
  // The owner and its favourites in one nested write, so both are saved or neither is. Each
  // sample's place in the list becomes its position on the dashboard.
  await db.owner.create({
    data: {
      key,
      createdAt: now,
      lastSeenAt: now,
      favourites: { create: samples.map((sample, position) => ({ ...sample, position, createdAt: now })) },
    },
  });
  // Only the key goes back; the owner's numeric id never leaves the server.
  return key;
}

// The id of the owner with this key, or null if there is none. It also records that the owner
// was seen, but writes only when the last record is over an hour old: one small write per hour
// of use instead of one per request, which is precise enough for a 30-day cutoff.
export async function findOwnerId(db: Db, key: string, now: Date): Promise<number | null> {
  // `select` reads only the two columns this needs.
  const owner = await db.owner.findUnique({ where: { key }, select: { id: true, lastSeenAt: true } });
  // No owner has this key.
  if (owner === null) return null;
  // Only a record over an hour old is refreshed.
  if (now.getTime() - owner.lastSeenAt.getTime() > HOUR_MS) {
    await db.owner.update({ where: { id: owner.id }, data: { lastSeenAt: now } });
  }
  // The id the routes use to scope every query to this owner.
  return owner.id;
}

// Deletes owners not seen for STALE_DAYS days and returns how many went. Their favourites go
// too: the foreign key is ON DELETE CASCADE (onDelete: Cascade in the schema), so Postgres
// removes them in the same statement.
export async function deleteStaleOwners(db: Db, now: Date): Promise<number> {
  // `lt` is "less than": last seen before the cutoff.
  const { count } = await db.owner.deleteMany({ where: { lastSeenAt: { lt: daysBefore(now, STALE_DAYS) } } });
  // How many owners were removed, for the log line in index.ts.
  return count;
}
