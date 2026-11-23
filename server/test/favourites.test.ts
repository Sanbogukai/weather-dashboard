// Favourites: list, add, the repeat and the 12-card limit, resize, move, remove, and that one
// owner can never touch another's cards.

// Vitest's test functions.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
// Shared set-up.
import {
  BAD_REQUEST,
  CONFLICT,
  CREATED,
  KEY,
  NOT_FOUND,
  NO_CONTENT,
  OK,
  UNPROCESSABLE,
  db,
  makeApp,
  newOwner,
  resetDb,
} from './helpers.ts';
// The card limit.
import { FAVOURITES_MAX } from '../src/favourites.ts';
// The samples, as ready-made places.
import { SAMPLES } from '../src/samples.ts';
// The place shape a request carries.
import type { Place } from '../../shared/types.ts';

// Each test starts from empty tables; the connection closes when the file is done.
beforeEach(resetDb);
afterAll(() => db.$disconnect());

// The second made-up place, for tests that save two.
const SECOND = 2;
// Card positions in a three-card list: the middle and the last.
const MIDDLE = 1;
const LAST = SAMPLES.length - 1;
// Out of range: a latitude past the pole, and a position far past the end.
const BAD_LATITUDE = 91;
const FAR_PAST_END = 99;

// A made-up place for each number, so a test can save many different ones.
function place(n: number): Place {
  return { placeId: n, name: `City ${n}`, region: null, country: 'Testland', latitude: 0, longitude: 0, timezone: 'UTC' };
}

// The names of the owner's cards, in dashboard order.
async function names(api: ReturnType<typeof makeApp>['api'], key: string): Promise<string[]> {
  const res = await api.get('/api/favourites').set(KEY, key);
  return res.body.map((card: { name: string }) => card.name);
}

// The positions of the owner's cards, in dashboard order.
async function positions(api: ReturnType<typeof makeApp>['api'], key: string): Promise<number[]> {
  const res = await api.get('/api/favourites').set(KEY, key);
  return res.body.map((card: { position: number }) => card.position);
}

describe('POST /api/favourites', () => {
  it('saves a place as the last card, MEDIUM unless a size is given', async () => {
    const { api } = makeApp();
    const key = await newOwner(SAMPLES);
    const res = await api.post('/api/favourites').set(KEY, key).send(place(1));
    expect(res.status).toBe(CREATED);
    expect(res.body).toMatchObject({ ...place(1), size: 'MEDIUM', position: SAMPLES.length });
    // A size in the body is kept.
    const large = await api.post('/api/favourites').set(KEY, key).send({ ...place(SECOND), size: 'LARGE' });
    expect(large.body.size).toBe('LARGE');
  });

  it('answers 409 for a place already saved', async () => {
    const { api } = makeApp();
    const key = await newOwner();
    await api.post('/api/favourites').set(KEY, key).send(place(1));
    const again = await api.post('/api/favourites').set(KEY, key).send(place(1));
    expect(again.status).toBe(CONFLICT);
    expect(again.body.error.code).toBe('duplicate');
  });

  it('lets two owners save the same place', async () => {
    const { api } = makeApp();
    const first = await newOwner();
    const second = await newOwner();
    expect((await api.post('/api/favourites').set(KEY, first).send(place(1))).status).toBe(CREATED);
    expect((await api.post('/api/favourites').set(KEY, second).send(place(1))).status).toBe(CREATED);
  });

  it('answers 422 for the 13th card', async () => {
    const { api } = makeApp();
    // Starts the owner with a full dashboard: places 1 to FAVOURITES_MAX.
    const full = Array.from({ length: FAVOURITES_MAX }, (_unused, index) => ({ ...place(index + 1), size: 'MEDIUM' as const }));
    const key = await newOwner(full);
    const extra = await api.post('/api/favourites').set(KEY, key).send(place(FAVOURITES_MAX + 1));
    expect(extra.status).toBe(UNPROCESSABLE);
    expect(extra.body.error.code).toBe('favourites_full');
  });

  it('answers 400 with every bad field named', async () => {
    const { api } = makeApp();
    const key = await newOwner();
    const res = await api
      .post('/api/favourites')
      .set(KEY, key)
      .send({ ...place(1), latitude: BAD_LATITUDE, timezone: 'Mars/Olympus', size: 'HUGE' });
    expect(res.status).toBe(BAD_REQUEST);
    const fields = res.body.error.issues.map((issue: { field: string }) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(['latitude', 'timezone', 'size']));
  });
});

describe('PATCH /api/favourites/:id', () => {
  it('changes the size', async () => {
    const { api } = makeApp();
    const key = await newOwner(SAMPLES);
    const [first] = (await api.get('/api/favourites').set(KEY, key)).body;
    const res = await api.patch(`/api/favourites/${first.id}`).set(KEY, key).send({ size: 'SMALL' });
    expect(res.status).toBe(OK);
    expect(res.body.size).toBe('SMALL');
  });

  it('moves a card and keeps positions 0 to n-1 with no gaps', async () => {
    const { api } = makeApp();
    const key = await newOwner([...SAMPLES]);
    const [manila] = (await api.get('/api/favourites').set(KEY, key)).body;
    // Manila from first to last.
    const res = await api.patch(`/api/favourites/${manila.id}`).set(KEY, key).send({ position: LAST });
    expect(res.body.position).toBe(LAST);
    expect(await names(api, key)).toEqual(['Ottawa', 'Tokyo', 'Manila']);
    expect(await positions(api, key)).toEqual(SAMPLES.map((_sample, index) => index));
    // And back to the middle.
    await api.patch(`/api/favourites/${manila.id}`).set(KEY, key).send({ position: MIDDLE });
    expect(await names(api, key)).toEqual(['Ottawa', 'Manila', 'Tokyo']);
  });

  it('reads a position past the end as last', async () => {
    const { api } = makeApp();
    const key = await newOwner(SAMPLES);
    const [manila] = (await api.get('/api/favourites').set(KEY, key)).body;
    const res = await api.patch(`/api/favourites/${manila.id}`).set(KEY, key).send({ position: FAR_PAST_END });
    expect(res.body.position).toBe(LAST);
  });

  it('answers 400 for an empty change', async () => {
    const { api } = makeApp();
    const key = await newOwner(SAMPLES);
    const [first] = (await api.get('/api/favourites').set(KEY, key)).body;
    expect((await api.patch(`/api/favourites/${first.id}`).set(KEY, key).send({})).status).toBe(BAD_REQUEST);
  });

  it('answers 404 for an id that is not a number', async () => {
    const { api } = makeApp();
    const key = await newOwner();
    expect((await api.patch('/api/favourites/abc').set(KEY, key).send({ size: 'SMALL' })).status).toBe(NOT_FOUND);
  });
});

describe('DELETE /api/favourites/:id', () => {
  it('removes a card and closes the gap', async () => {
    const { api } = makeApp();
    const key = await newOwner(SAMPLES);
    const [, ottawa] = (await api.get('/api/favourites').set(KEY, key)).body;
    expect((await api.delete(`/api/favourites/${ottawa.id}`).set(KEY, key)).status).toBe(NO_CONTENT);
    expect(await names(api, key)).toEqual(['Manila', 'Tokyo']);
    expect(await positions(api, key)).toEqual([0, 1]);
    // Gone means gone: a second delete is a 404.
    expect((await api.delete(`/api/favourites/${ottawa.id}`).set(KEY, key)).status).toBe(NOT_FOUND);
  });
});

describe("another owner's favourite", () => {
  it('looks exactly like a missing one, and stays untouched', async () => {
    const { api } = makeApp();
    const owner = await newOwner(SAMPLES);
    const stranger = await newOwner();
    const [mine] = (await api.get('/api/favourites').set(KEY, owner)).body;
    // The stranger sees none of the owner's cards.
    expect((await api.get('/api/favourites').set(KEY, stranger)).body).toEqual([]);
    // Edit and delete both answer 404.
    expect((await api.patch(`/api/favourites/${mine.id}`).set(KEY, stranger).send({ size: 'SMALL' })).status).toBe(
      NOT_FOUND,
    );
    expect((await api.delete(`/api/favourites/${mine.id}`).set(KEY, stranger)).status).toBe(NOT_FOUND);
    // The owner's cards are as they were.
    expect(await names(api, owner)).toEqual(SAMPLES.map((sample) => sample.name));
  });
});
