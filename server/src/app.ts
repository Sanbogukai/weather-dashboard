// Builds the Express app without starting it. Tests import createApp() and hand the app to
// Supertest; index.ts imports the same function and calls listen.

// Express handles HTTP: routing and JSON parsing. The other two are only types.
import express, { type ErrorRequestHandler, type Express } from 'express';
// Sets the security headers (Content-Security-Policy and friends) on every answer.
import helmet from 'helmet';
// Joins folder and file names for the built client.
import { join } from 'node:path';
// The database client type.
import type { Db } from './db.ts';
// The error shape every failure is sent in, shared with the client.
import type { ApiError } from '../../shared/types.ts';
// The expected-failure type, whose status, code and issues go into the answer.
import { ApiFailure } from './errors.ts';
// The in-memory cache for upstream answers.
import { type Cache, createCache } from './cache.ts';
// The Open-Meteo client and its type.
import { type OpenMeteo, createOpenMeteo } from './openMeteo.ts';
// The API routes.
import { apiRouter } from './routes.ts';
// The holidays client and its type.
import { type NagerDate, createNagerDate } from './nagerDate.ts';
// The festivals client and its type.
import { type Wikidata, createWikidata } from './wikidata.ts';

// The largest JSON body accepted. A favourite is a place and a size, so 16 kB is plenty and
// stops anyone posting megabytes at the API.
const JSON_LIMIT = '16kb';

// HTTP status codes used here, by name.
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;
const HTTP_UNAVAILABLE = 503;

// Render puts proxies in front of the app; trusting this many hops lets req.ip be the
// visitor's address (from X-Forwarded-For) instead of the proxy's, for the rate limits.
const TRUSTED_PROXIES = 3;

// The default limits: new owners per IP per hour, and upstream-backed requests (places,
// weather, holidays) per owner per minute.
const OWNER_LIMIT = 10;
const UPSTREAM_LIMIT = 120;

// How long a browser may keep a hashed asset. Vite puts a hash of the content in each asset's
// name, so a changed file gets a new name and a year is safe.
const ASSET_MAX_AGE = '1y';

// What the caller passes in. Only the database is required; everything else has a real default,
// and tests swap any of them (a fixed clock, fake upstream clients, small limits). clientDir is
// the built client (client/dist); without it the app serves the API alone, as in development,
// where Vite serves the client.
export interface AppOptions {
  db: Db;
  // The clock, read for every "now" the app needs.
  now?: () => Date;
  // City search and forecasts.
  openMeteo?: OpenMeteo;
  // Public holidays by country.
  nagerDate?: NagerDate;
  // Festivals near a point.
  wikidata?: Wikidata;
  // The upstream cache; one per app by default.
  cache?: Cache;
  ownerLimit?: number;
  upstreamLimit?: number;
  clientDir?: string;
}

// The options with every default filled in, as the routes see them. clientDir is not a
// service the routes use, so it is left out.
export type AppDeps = Required<Omit<AppOptions, 'clientDir'>>;

// Builds the error body every failure uses.
function errorBody(code: string, message: string, issues?: ApiError['error']['issues']): ApiError {
  // `issues` is left out entirely when there are none, so the JSON stays small.
  return { error: issues ? { code, message, issues } : { code, message } };
}

// Returns a new, fully wired app.
export function createApp(options: AppOptions): Express {
  // The clock first, because the default cache reads it too.
  const now = options.now ?? (() => new Date());
  // Each option the caller left out gets its real default.
  const deps: AppDeps = {
    db: options.db,
    now,
    openMeteo: options.openMeteo ?? createOpenMeteo(),
    nagerDate: options.nagerDate ?? createNagerDate(),
    wikidata: options.wikidata ?? createWikidata(),
    cache: options.cache ?? createCache({ now }),
    ownerLimit: options.ownerLimit ?? OWNER_LIMIT,
    upstreamLimit: options.upstreamLimit ?? UPSTREAM_LIMIT,
  };

  // Creates the app that every middleware and route below is attached to.
  const app = express();

  // Reads the visitor's address through the hosting proxies.
  app.set('trust proxy', TRUSTED_PROXIES);

  // Security headers first, so every answer below carries them.
  app.use(helmet());

  // Parses JSON request bodies into req.body, refusing anything over the limit with a 413.
  app.use(express.json({ limit: JSON_LIMIT }));

  // Asks the database a trivial question, so a health check shows the app can reach it.
  app.get('/api/health', async (_req, res) => {
    try {
      // SELECT 1 needs no table; it only proves the connection works.
      await deps.db.$queryRaw`SELECT 1`;
      // The database answered.
      res.json({ ok: true });
    } catch (err) {
      // Logged for debugging; the visitor only learns that the database is not answering.
      console.error(err);
      // 503: the service is there but cannot do its job right now.
      res.status(HTTP_UNAVAILABLE).json({ ok: false });
    }
  });

  // Owners, favourites, places, weather and holidays.
  app.use('/api', apiRouter(deps));

  // Unknown API routes get JSON, not Express's HTML page. It runs only when no route
  // above matched, because a matching route ends the request.
  app.use('/api', (req, res) => {
    res.status(HTTP_NOT_FOUND).json(errorBody('not_found', `No route for ${req.method} ${req.originalUrl}`));
  });

  // The built client, after the API so /api never falls through to the page.
  if (options.clientDir) serveClient(app, options.clientDir);

  // Errors always come back as JSON in the one shape. Express knows this is the error handler
  // because it takes four arguments; `_next` is unused but must be listed.
  const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
    // Our own expected failures carry their status, code and issues.
    if (err instanceof ApiFailure) {
      // Upstream failures are logged, to spot an outage; client mistakes (4xx) are not, or
      // every typo would add a log line.
      if (err.code.startsWith('upstream_')) console.error(`${err.code}: ${err.message}`);
      // Sends the failure as it was described.
      res.status(err.status).json(errorBody(err.code, err.message, err.issues));
      return;
    }
    // Express's own errors (a bad JSON body is 400, a body over the limit is 413) carry a
    // status; anything else is a bug, so 500.
    const status: number = err.status ?? err.statusCode ?? HTTP_SERVER_ERROR;
    // A bug is logged in full; a malformed request is not worth a log line.
    if (status >= HTTP_SERVER_ERROR) console.error(err);
    // A 500 never shows its internal message; a 4xx explains what was wrong.
    const message = status >= HTTP_SERVER_ERROR ? 'Something went wrong' : err.message;
    // 'bad_request' covers every 4xx Express raises itself.
    res.status(status).json(errorBody(status >= HTTP_SERVER_ERROR ? 'server_error' : 'bad_request', message));
  };
  // Added last, so it catches errors from everything above.
  app.use(handleError);

  // The caller decides whether to listen (index.ts) or to test it (Supertest).
  return app;
}

// Serves the single-page client from dir: hashed assets, then the other files, then
// index.html for every other page address.
function serveClient(app: Express, dir: string): void {
  // Hashed files, cached for a year. A missing one is a plain 404 (fallthrough: false), not
  // the page, so a stale script reference fails loudly instead of loading HTML as JavaScript.
  app.use(
    '/assets',
    express.static(join(dir, 'assets'), { immutable: true, maxAge: ASSET_MAX_AGE, fallthrough: false }),
  );
  // Unhashed files such as favicon.svg, revalidated each time. index: false leaves / to the
  // fallback below, so index.html always goes out with the same no-cache header.
  app.use(express.static(dir, { index: false }));
  // Every other GET is a page of the app: send index.html, and tell the browser to check
  // for a new one each time, so a deploy shows at once. cacheControl: false stops sendFile
  // from writing its own Cache-Control over ours.
  app.get('/{*page}', (_req, res) => {
    res.sendFile('index.html', { root: dir, cacheControl: false, headers: { 'Cache-Control': 'no-cache' } });
  });
}
