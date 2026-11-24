// The API's routes: owners, favourites, place search, weather and holidays. Each route checks its
// input with Zod, finds the owner from the key header, and hands the work to favourites.ts or
// to an upstream client through the cache.

// Router groups the routes; the rest are types for the handlers below.
import { Router, type Request, type RequestHandler } from 'express';
// Counts requests per visitor and answers 429 past the limit.
import { rateLimit } from 'express-rate-limit';
// Declares the shape of each input and reports every problem at once.
import { z } from 'zod';
// The services the routes use, with defaults filled in.
import type { AppDeps } from './app.ts';
// Two capital letters, such as "PH".
import { COUNTRY_CODE } from './countryCode.ts';
// The error type every expected failure is thrown as.
import { ApiFailure } from './errors.ts';
// The favourite queries.
import { FAVOURITES_MAX, addFavourite, deleteFavourite, listFavourites, updateFavourite } from './favourites.ts';
// Owner creation and lookup, and the time units.
import { DAY_MS, HOUR_MS, MINUTE_MS, createOwner, findOwnerId } from './owners.ts';

// The header the browser sends its key in.
export const OWNER_HEADER = 'X-Owner-Key';

// HTTP status codes used here, by name.
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;

// How long each kind of answer is served from memory before it is fetched again. Weather
// changes within the hour; holidays, festivals and city names hardly change in a day.
const WEATHER_TTL_MINUTES = 10;
export const WEATHER_TTL_MS = WEATHER_TTL_MINUTES * MINUTE_MS;
export const HOLIDAYS_TTL_MS = DAY_MS;
export const PLACES_TTL_MS = DAY_MS;

// Coordinates are rounded to 2 decimals (about 1 km) for the cache key: multiply by 100,
// round, divide.
const COORDINATE_SCALE = 100;

// At most this many holidays and festivals together on one card.
export const HOLIDAYS_MAX = 6;

// Input limits.
const QUERY_MIN = 2;
const QUERY_MAX = 100;
const NAME_MAX = 200;
const TIMEZONE_MAX = 64;
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;
// The largest id Postgres's INTEGER column holds; anything bigger cannot be a favourite.
const ID_MAX = 2_147_483_647;

// True for a time zone name the runtime knows, such as "Asia/Manila" or "UTC". Building a
// formatter throws a RangeError for an unknown one, which is a check without a hand-written list.
function isTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

// A time zone name.
const timezone = z.string().max(TIMEZONE_MAX).refine(isTimeZone, 'Not a known time zone');
// Latitude and longitude, from a query string (text) or a JSON body (a number).
const latitude = z.coerce.number().min(-LATITUDE_MAX).max(LATITUDE_MAX);
const longitude = z.coerce.number().min(-LONGITUDE_MAX).max(LONGITUDE_MAX);
// A country code, from a query string or a JSON body.
const countryCode = z.string().regex(COUNTRY_CODE, 'Not a two-letter country code');
// A card size.
const cardSize = z.enum(['SMALL', 'MEDIUM', 'LARGE']);

// GET /places.
const placesQuery = z.object({
  q: z.string().trim().min(QUERY_MIN, 'Type at least 2 letters').max(QUERY_MAX, 'Search text can be at most 100 characters'),
});

// GET /weather.
const weatherQuery = z.object({ lat: latitude, lon: longitude, tz: timezone });

// GET /holidays. The country is "" for a city saved before codes were stored; it gets
// festivals only.
const holidaysQuery = z.object({ lat: latitude, lon: longitude, country: z.union([z.literal(''), countryCode]) });

// POST /favourites: a place exactly as /places returned it, and an optional size.
const favouriteBody = z.object({
  placeId: z.number().int().positive().max(ID_MAX),
  name: z.string().trim().min(1).max(NAME_MAX),
  region: z.string().trim().max(NAME_MAX).nullable(),
  country: z.string().trim().min(1).max(NAME_MAX),
  countryCode,
  latitude,
  longitude,
  timezone,
  size: cardSize.default('MEDIUM'),
});

// PATCH /favourites/:id: a size, a position, or both, but at least one.
const patchBody = z
  .object({ size: cardSize.optional(), position: z.number().int().min(0).optional() })
  .refine((changes) => changes.size !== undefined || changes.position !== undefined, 'Nothing to change');

// A favourite id from the path.
const idParam = z.coerce.number().int().positive().max(ID_MAX);

// The owner key: a UUID, as createOwner makes.
const ownerKey = z.uuid();

// The value if it fits the schema; otherwise a 400 listing every problem by field.
function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  // A problem with the whole object (such as "Nothing to change") has an empty path.
  const issues = result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
  throw new ApiFailure(HTTP_BAD_REQUEST, 'bad_request', 'Some fields are not valid', issues);
}

// A coordinate rounded to 2 decimals, for the upstream call and the cache key alike.
function round(value: number): number {
  return Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
}

// The 404 for a favourite that is not this owner's. A missing one and another owner's look the
// same, so ids reveal nothing.
function notFound(): ApiFailure {
  return new ApiFailure(HTTP_NOT_FOUND, 'not_found', 'No such favourite');
}

// The owner behind each request, recorded by requireOwner. A WeakMap keyed by the request
// drops the entry once the request is finished with, and keeps the request object untouched.
const owners = new WeakMap<Request, number>();

// The owner's id for a request that passed requireOwner.
function ownerOf(req: Request): number {
  // requireOwner runs first on every route that calls this, so the entry is always there.
  return owners.get(req) ?? 0;
}

// Builds the router over the app's services.
export function apiRouter(deps: AppDeps): Router {
  const router = Router();

  // Finds the owner from the key header, or answers 401. It is added to each route that needs
  // it rather than to the whole router, so an unknown /api path still gets a 404.
  const requireOwner: RequestHandler = async (req, _res, next) => {
    // A key that is not even a UUID cannot exist, so it skips the database.
    const key = ownerKey.safeParse(req.get(OWNER_HEADER));
    const ownerId = key.success ? await findOwnerId(deps.db, key.data, deps.now()) : null;
    if (ownerId === null) throw new ApiFailure(HTTP_UNAUTHORIZED, 'unauthorized', 'Unknown or missing owner key');
    // Later handlers read it with ownerOf().
    owners.set(req, ownerId);
    next();
  };

  // The limits' 429 answer, in the API's error shape. Passing it to next() sends it through
  // the error handler like every other failure.
  const tooMany: RequestHandler = (_req, _res, next) => {
    next(new ApiFailure(HTTP_TOO_MANY, 'rate_limited', 'Too many requests; try again later'));
  };

  // New owners per IP address per hour. Each owner copies the samples, so this keeps a script
  // from filling the database. The store is in memory: one per app, reset on restart.
  const ownerLimiter = rateLimit({
    windowMs: HOUR_MS,
    limit: deps.ownerLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooMany,
  });

  // Upstream-backed requests per owner per minute. Counted by owner, not IP, so a shared
  // network does not share one allowance. Places, weather and holidays share it.
  const upstreamLimiter = rateLimit({
    windowMs: MINUTE_MS,
    limit: deps.upstreamLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `owner-${ownerOf(req)}`,
    handler: tooMany,
  });

  // Makes an owner with the sample cities and returns its key.
  router.post('/owners', ownerLimiter, async (_req, res) => {
    res.status(HTTP_CREATED).json({ key: await createOwner(deps.db, deps.now()) });
  });

  // City suggestions for the search box.
  router.get('/places', requireOwner, upstreamLimiter, async (req, res) => {
    const { q } = check(placesQuery, req.query);
    // Lower-cased for the key, so "Manila" and "manila" share one entry.
    const key = `places:${q.toLowerCase()}`;
    // Only the list goes back; how fresh a list of city names is does not matter to anyone.
    const places = await deps.cache.get(key, PLACES_TTL_MS, () => deps.openMeteo.searchPlaces(q));
    res.json(places.data);
  });

  // The owner's favourites in dashboard order.
  router.get('/favourites', requireOwner, async (req, res) => {
    res.json(await listFavourites(deps.db, ownerOf(req)));
  });

  // Saves a place as the last card.
  router.post('/favourites', requireOwner, async (req, res) => {
    const { size, ...place } = check(favouriteBody, req.body);
    const result = await addFavourite(deps.db, ownerOf(req), place, size, deps.now());
    // The same city twice.
    if ('duplicate' in result) throw new ApiFailure(HTTP_CONFLICT, 'duplicate', `${place.name} is already on your dashboard`);
    // A 13th card.
    if ('full' in result) {
      throw new ApiFailure(HTTP_UNPROCESSABLE, 'favourites_full', `You can keep up to ${FAVOURITES_MAX} cities`);
    }
    res.status(HTTP_CREATED).json(result.created);
  });

  // Changes a card's size or position.
  router.patch('/favourites/:id', requireOwner, async (req, res) => {
    // A path that is not a valid id cannot name a favourite, so it is a 404 like a missing one.
    const id = idParam.safeParse(req.params.id);
    if (!id.success) throw notFound();
    const changes = check(patchBody, req.body);
    const updated = await updateFavourite(deps.db, ownerOf(req), id.data, changes);
    if (updated === null) throw notFound();
    res.json(updated);
  });

  // Removes a card.
  router.delete('/favourites/:id', requireOwner, async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    // `&&` skips the database for an id that cannot exist.
    const deleted = id.success && (await deleteFavourite(deps.db, ownerOf(req), id.data));
    if (!deleted) throw notFound();
    res.status(HTTP_NO_CONTENT).end();
  });

  // The weather at a point, through the cache.
  router.get('/weather', requireOwner, upstreamLimiter, async (req, res) => {
    const query = check(weatherQuery, req.query);
    // Rounded once, so the call and the key use the same numbers.
    const lat = round(query.lat);
    const lon = round(query.lon);
    // The time zone is part of the key, because it changes the local times in the answer.
    const key = `weather:${lat},${lon},${query.tz}`;
    res.json(await deps.cache.get(key, WEATHER_TTL_MS, () => deps.openMeteo.forecast(lat, lon, query.tz)));
  });

  // The country's holidays and the festivals near a point, each through the cache, merged.
  router.get('/holidays', requireOwner, upstreamLimiter, async (req, res) => {
    const { country, ...query } = check(holidaysQuery, req.query);
    const lat = round(query.lat);
    const lon = round(query.lon);
    // Both at once. Holidays are per country, so every city in one country shares an entry;
    // no country means no holidays to look up.
    const [holidays, festivals] = await Promise.allSettled([
      country === ''
        ? Promise.resolve(null)
        : deps.cache.get(`holidays:${country}`, HOLIDAYS_TTL_MS, () => deps.nagerDate.nextHolidays(country)),
      deps.cache.get(`festivals:${lat},${lon}`, HOLIDAYS_TTL_MS, () => deps.wikidata.festivalsNear(lat, lon, deps.now())),
    ]);
    // Holidays are the main part: if they fail, the whole answer fails and the card offers Retry.
    if (holidays.status === 'rejected') throw holidays.reason;
    // Festivals are extra: if Wikidata fails, the card shows holidays alone. The failure is
    // logged, to spot an outage.
    if (festivals.status === 'rejected') console.error('Festivals failed; holidays sent alone:', festivals.reason);
    // The parts that answered.
    const parts = [holidays.value, festivals.status === 'fulfilled' ? festivals.value : null].filter((part) => part !== null);
    // Both lists in one, soonest first, cut to the card's limit. ISO dates sort as text.
    const merged = parts
      .flatMap((part) => part.data)
      .toSorted((a, b) => a.date.localeCompare(b.date))
      .slice(0, HOLIDAYS_MAX);
    // The answer is as old as its oldest part, and stale if either part is.
    const fetchedAt = parts.map((part) => part.fetchedAt).toSorted()[0] ?? deps.now().toISOString();
    res.json({ data: merged, fetchedAt, stale: parts.some((part) => part.stale) });
  });

  return router;
}
