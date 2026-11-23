// Thin, typed wrappers over the API. This is the only file that talks to the server; components
// call these functions instead. Every failure becomes an ApiError carrying the server's error
// code, so the page can pick its own wording for it (see messages.ts).

// The shapes the server sends and accepts. `import type` is erased before the code runs.
import type { ApiError as ErrorBody, CardSize, EventItem, Favourite, Place, Upstream, Weather } from '../../shared/types.ts'
// Adds the owner key to each request.
import { createKeyedFetch } from './keyedFetch.ts'
// The error every failed call throws, and the code for "no answer at all".
import { ApiError, UNREACHABLE } from './errors.ts'

// Statuses from 500 up are the server's fault, not the request's.
const HTTP_SERVER_ERROR = 500
// 204 has no body to read.
const HTTP_NO_CONTENT = 204

// One sender for the whole app, over the real localStorage and fetch.
const keyed = createKeyedFetch(window.localStorage, (url, init) => fetch(url, init))

// The body as JSON, or null when it is not JSON (a proxy's error page).
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

// Sends one request and returns the parsed JSON body as type T. TypeScript trusts the server
// sends that shape, which holds because both sides share shared/types.ts.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await keyed.send(path, {
    // Only requests with a body say they are sending JSON.
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  // Nothing to read on 204 No Content.
  if (res.status === HTTP_NO_CONTENT) return undefined as T
  const body = await readJson(res)
  // Success: the body is the answer.
  if (res.ok) return body as T
  // Partial, because a proxy or crash page might send something else entirely.
  const problem = (body ?? {}) as Partial<ErrorBody>
  // Our server always sends a code; anything else counts as the server being out of reach.
  if (problem.error) throw new ApiError(problem.error.message, res.status, problem.error.code, problem.error.issues)
  // A 5xx with no body usually means the API server is down (Vite's proxy answers 502).
  const message = res.status >= HTTP_SERVER_ERROR ? 'The server is not responding' : 'Request failed'
  throw new ApiError(`${message} (${res.status})`, res.status, UNREACHABLE)
}

// A JSON request body.
function jsonBody(method: string, data: unknown): RequestInit {
  return { method, body: JSON.stringify(data) }
}

// City suggestions for the search box.
export function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  return request(`/places?${new URLSearchParams({ q: query })}`, { signal })
}

// The owner's cards, in order.
export function listFavourites(signal?: AbortSignal): Promise<Favourite[]> {
  return request('/favourites', { signal })
}

// Saves a place as the last card.
export function addFavourite(place: Place, size: CardSize): Promise<Favourite> {
  return request('/favourites', jsonBody('POST', { ...place, size }))
}

// Changes a card's size or position.
export function updateFavourite(id: number, changes: { size?: CardSize; position?: number }): Promise<Favourite> {
  return request(`/favourites/${id}`, jsonBody('PATCH', changes))
}

// Removes a card.
export function deleteFavourite(id: number): Promise<void> {
  return request(`/favourites/${id}`, { method: 'DELETE' })
}

// The query string for a place's point, and its time zone when asked for.
function pointQuery(place: Place, withZone: boolean): string {
  // The server rounds the point itself, so the full numbers go as they are.
  const params = new URLSearchParams({ lat: String(place.latitude), lon: String(place.longitude) })
  // Only the weather route reads the time zone.
  if (withZone) params.set('tz', place.timezone)
  return params.toString()
}

// The weather for a card's place.
export function fetchWeather(place: Place, signal?: AbortSignal): Promise<Upstream<Weather>> {
  return request(`/weather?${pointQuery(place, true)}`, { signal })
}

// Upcoming events near a card's place.
export function fetchEvents(place: Place, signal?: AbortSignal): Promise<Upstream<EventItem[]>> {
  return request(`/events?${pointQuery(place, false)}`, { signal })
}

// Starts a fresh dashboard with the samples; the old one is left for the server's clean-up.
export async function startOver(): Promise<void> {
  await keyed.startOver()
}
