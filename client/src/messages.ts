// The words the page shows for a failure. The server's error codes are stable, so the page picks
// its own short wording from the code, naming the part of the card that failed.

// The error type the API wrapper throws, and its code for "no answer at all".
import { ApiError, UNREACHABLE } from './errors.ts'

// Which part of a card asked: the wording names the service behind it.
export type Part = 'weather' | 'holidays' | 'page'

// The service each part depends on, as people would say it.
const SERVICE: Record<Part, string> = {
  weather: 'The weather service',
  holidays: 'The holidays service',
  page: 'The server',
}

// One wording per code, given the service's name. Codes not listed here (such as "duplicate")
// use the server's own message, which is written to be shown.
const WORDING: Record<string, (service: string) => string> = {
  upstream_timeout: (service) => `${service} is slow right now`,
  upstream_quota: (service) => `${service} has reached its limit for now`,
  upstream_error: (service) => `${service} had a problem`,
  rate_limited: () => 'Too many requests. Wait a minute and try again',
  [UNREACHABLE]: () => "Can't reach the server",
}

// A short message for anything thrown while loading `part`.
export function messageFor(error: unknown, part: Part): string {
  // fetch rejects with a TypeError when there is no network or the server is gone.
  if (!(error instanceof ApiError)) return "Can't reach the server"
  // The wording for the code, or the server's message when the code has none.
  const wording = WORDING[error.code]
  return wording ? wording(SERVICE[part]) : error.message
}
