// One way to call an upstream API: a GET with a time limit, whose JSON is checked against a
// Zod schema before anything uses it. Every way it can fail becomes an ApiFailure with one of
// three codes, so the client can say what went wrong without knowing which service it was:
//   upstream_timeout  no answer within the time limit
//   upstream_quota    the service says we have used up our calls (HTTP 429)
//   upstream_error    anything else: no connection, a 5xx, bad JSON, or an unexpected shape
//
// The URL is never logged or put in a message, so a service that takes a key in the query
// string cannot leak it through a log.

// Declares the shape of each answer.
import type { z } from 'zod';
// The error type the app's error handler turns into JSON.
import { ApiFailure } from './errors.ts';

// The fetch function's type. Tests pass a fake with the same shape, so no test reaches the
// internet.
export type FetchFn = typeof fetch;

// How long an upstream call may take before it is given up on: 5 seconds.
export const UPSTREAM_TIMEOUT_MS = 5000;

// Every upstream failure is answered with 502 Bad Gateway: our server is fine, the one behind
// it is not.
const HTTP_BAD_GATEWAY = 502;
// The status a service sends when we have made too many calls.
const HTTP_TOO_MANY = 429;
// The status for a success with no body, which Nager.Date sends for a country it does not cover.
const HTTP_NO_CONTENT = 204;

// What getJson needs for one call.
export interface UpstreamCall<T> {
  // The fetch to use: the real one, or a test's fake.
  fetchFn: FetchFn;
  // The full address, query string included.
  url: string;
  // The shape the answer must have.
  schema: z.ZodType<T>;
  // The service's name for people, such as "The weather service".
  service: string;
  // The time limit; UPSTREAM_TIMEOUT_MS unless a test shortens it.
  timeoutMs: number;
  // The answer to use for a 204 No Content; without it, a 204 is an error like any empty body.
  noContent?: T;
  // Extra request headers, such as the User-Agent Wikidata asks every client to send.
  headers?: Record<string, string>;
}

// Makes the failure for one code, with a message that names the service.
function failure(code: string, message: string): ApiFailure {
  return new ApiFailure(HTTP_BAD_GATEWAY, code, message);
}

// Sends the GET and returns the checked answer, or throws an ApiFailure.
export async function getJson<T>({ fetchFn, url, schema, service, timeoutMs, noContent, headers }: UpstreamCall<T>): Promise<T> {
  // The response, once it arrives.
  let response: Response;
  try {
    // AbortSignal.timeout cancels the request when the time is up, and the fetch then throws
    // an error named TimeoutError.
    response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', ...headers } });
  } catch (err) {
    // Too slow.
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw failure('upstream_timeout', `${service} took too long to answer`);
    }
    // No connection at all: DNS, refused, reset.
    throw failure('upstream_error', `${service} could not be reached`);
  }

  // Our allowance with the service is used up for now.
  if (response.status === HTTP_TOO_MANY) throw failure('upstream_quota', `${service} has had too many requests today`);
  // Nothing to say, and the caller knows what that means.
  if (response.status === HTTP_NO_CONTENT && noContent !== undefined) return noContent;
  // Any other answer that is not a success, such as a 500 or a 403 for a bad key.
  if (!response.ok) throw failure('upstream_error', `${service} answered with an error`);

  // The body as JSON; a page of HTML or a cut-off body fails here.
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw failure('upstream_error', `${service} sent an answer that is not JSON`);
  }

  // The shape check: a field that is missing or the wrong type means the service changed, and
  // nothing downstream should guess at what it meant.
  const result = schema.safeParse(body);
  if (!result.success) throw failure('upstream_error', `${service} sent an answer in an unexpected shape`);
  // The answer, typed.
  return result.data;
}
