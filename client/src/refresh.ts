// When a card asks for its weather and events again on its own. The server keeps weather for
// 10 minutes, so asking more often would only get the same answer back.

// Ten minutes, in milliseconds.
const REFRESH_MINUTES = 10
const MINUTE_MS = 60_000
export const REFRESH_MS = REFRESH_MINUTES * MINUTE_MS

// Whether a part loaded at `loadedAt` (ms since 1970, or null if it never loaded) is due a
// refresh at `now`, given whether the page can be seen. A hidden tab never refreshes; it catches
// up when it is shown again.
export function isDue(loadedAt: number | null, now: number, visible: boolean): boolean {
  // Nothing to show while hidden, so no request.
  if (!visible) return false
  // Never loaded: always due. Otherwise, due once the interval has passed.
  return loadedAt === null || now - loadedAt >= REFRESH_MS
}
