// Builds the Express app without starting it. Tests import createApp() and hand the app to
// Supertest; index.ts imports the same function and calls listen.

// Express handles HTTP: routing and JSON parsing. The other two are only types.
import express, { type ErrorRequestHandler, type Express } from 'express';
// Sets the security headers (Content-Security-Policy and friends) on every answer.
import helmet from 'helmet';
// The database client type.
import type { Db } from './db.ts';
// The error shape every failure is sent in, shared with the client.
import type { ApiError } from '../../shared/types.ts';
// The expected-failure type, whose status, code and issues go into the answer.
import { ApiFailure } from './errors.ts';

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

// What the caller passes in. Only the database is required for now; later phases add the
// clock, the upstream clients and the limits, so tests can swap each one.
export interface AppOptions {
  db: Db;
}

// Builds the error body every failure uses.
function errorBody(code: string, message: string, issues?: ApiError['error']['issues']): ApiError {
  // `issues` is left out entirely when there are none, so the JSON stays small.
  return { error: issues ? { code, message, issues } : { code, message } };
}

// Returns a new, fully wired app.
export function createApp(options: AppOptions): Express {
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
      await options.db.$queryRaw`SELECT 1`;
      // The database answered.
      res.json({ ok: true });
    } catch (err) {
      // Logged for debugging; the visitor only learns that the database is not answering.
      console.error(err);
      // 503: the service is there but cannot do its job right now.
      res.status(HTTP_UNAVAILABLE).json({ ok: false });
    }
  });

  // Unknown API routes get JSON, not Express's HTML page. It runs only when no route
  // above matched, because a matching route ends the request.
  app.use('/api', (req, res) => {
    res.status(HTTP_NOT_FOUND).json(errorBody('not_found', `No route for ${req.method} ${req.originalUrl}`));
  });

  // Errors always come back as JSON in the one shape. Express knows this is the error handler
  // because it takes four arguments; `_next` is unused but must be listed.
  const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
    // Our own expected failures carry their status, code and issues.
    if (err instanceof ApiFailure) {
      // Upstream and other server-side failures are logged; client mistakes (4xx) are not.
      if (err.status >= HTTP_SERVER_ERROR) console.error(err.message);
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
