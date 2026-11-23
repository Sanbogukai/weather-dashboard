// Owners: creation with the sample cities, the key check, last-seen updates and the stale
// clean-up.

// Vitest's test functions.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// Shared set-up.
import { CREATED, KEY, NOT_FOUND, NOW, OK, TOO_MANY, UNAUTHORIZED, db, makeApp, newOwner, resetDb } from './helpers.ts';
// The code under test, and its time constants.
import { DAY_MS, HOUR_MS, STALE_DAYS, deleteStaleOwners, findOwnerId } from '../src/owners.ts';
// The samples every new owner gets.
import { SAMPLES } from '../src/samples.ts';

// Each test starts from empty tables; the connection closes when the file is done.
beforeEach(resetDb);
afterAll(() => db.$disconnect());

// A moment `ms` milliseconds after NOW.
const later = (ms: number) => new Date(NOW.getTime() + ms);

// An address from the range set aside for documentation, as a second visitor.
const OTHER_IP = '203.0.113.9';

describe('POST /api/owners', () => {
  it('returns a key whose owner holds the sample cities in order', async () => {
    const { api } = makeApp();
    const res = await api.post('/api/owners');
    expect(res.status).toBe(CREATED);
    // The key unlocks the list, which holds every sample at its own size, in file order.
    const list = await api.get('/api/favourites').set(KEY, res.body.key);
    expect(list.status).toBe(OK);
    expect(list.body.map((card: { name: string }) => card.name)).toEqual(SAMPLES.map((sample) => sample.name));
    expect(list.body.map((card: { size: string }) => card.size)).toEqual(SAMPLES.map((sample) => sample.size));
    expect(list.body.map((card: { position: number }) => card.position)).toEqual(SAMPLES.map((_sample, index) => index));
  });

  it('never sends the owner id or the owner column back', async () => {
    const { api } = makeApp();
    const { body } = await api.post('/api/owners');
    // Only the key.
    expect(Object.keys(body)).toEqual(['key']);
    const [card] = (await api.get('/api/favourites').set(KEY, body.key)).body;
    expect(card).not.toHaveProperty('ownerId');
  });

  it('answers 429 past the hourly limit per address', async () => {
    const { api } = makeApp({ ownerLimit: 1 });
    expect((await api.post('/api/owners')).status).toBe(CREATED);
    const blocked = await api.post('/api/owners');
    expect(blocked.status).toBe(TOO_MANY);
    expect(blocked.body.error.code).toBe('rate_limited');
    // Another address still gets one; trust proxy reads it from X-Forwarded-For.
    const other = await api.post('/api/owners').set('X-Forwarded-For', OTHER_IP);
    expect(other.status).toBe(CREATED);
  });
});

describe('the owner key', () => {
  it('is required', async () => {
    const { api } = makeApp();
    const res = await api.get('/api/favourites');
    expect(res.status).toBe(UNAUTHORIZED);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('must be a UUID', async () => {
    const { api } = makeApp();
    expect((await api.get('/api/favourites').set(KEY, 'not-a-key')).status).toBe(UNAUTHORIZED);
  });

  it('must belong to an owner', async () => {
    const { api } = makeApp();
    expect((await api.get('/api/favourites').set(KEY, crypto.randomUUID())).status).toBe(UNAUTHORIZED);
  });

  it('still lets unknown /api paths answer 404, not 401', async () => {
    const { api } = makeApp();
    expect((await api.get('/api/nothing-here')).status).toBe(NOT_FOUND);
  });
});

describe('last seen', () => {
  // The owner's stored last-seen time.
  async function lastSeen(key: string): Promise<number | undefined> {
    const owner = await db.owner.findUnique({ where: { key } });
    return owner?.lastSeenAt.getTime();
  }

  it('is written at most once an hour', async () => {
    const key = await newOwner();
    // Within the hour: unchanged.
    await findOwnerId(db, key, later(HOUR_MS));
    expect(await lastSeen(key)).toBe(NOW.getTime());
    // Past the hour: moved to the new time.
    const pastHour = later(HOUR_MS + 1);
    await findOwnerId(db, key, pastHour);
    expect(await lastSeen(key)).toBe(pastHour.getTime());
  });
});

describe('deleteStaleOwners', () => {
  it('removes owners unseen for 30 days, with their favourites', async () => {
    const stale = await newOwner(SAMPLES);
    // Seen again just before the clean-up, so it stays.
    const fresh = await newOwner(SAMPLES);
    const cleanUpAt = later(STALE_DAYS * DAY_MS + 1);
    await findOwnerId(db, fresh, cleanUpAt);

    expect(await deleteStaleOwners(db, cleanUpAt)).toBe(1);
    // The stale owner and its cards are gone; the fresh owner's cards remain.
    expect(await db.owner.findUnique({ where: { key: stale } })).toBeNull();
    expect(await db.favourite.count()).toBe(SAMPLES.length);
  });

  it('keeps an owner seen exactly 30 days ago', async () => {
    await newOwner();
    expect(await deleteStaleOwners(db, later(STALE_DAYS * DAY_MS))).toBe(0);
  });
});
