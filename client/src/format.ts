// Text for times and dates on the cards. The server sends a place's times as local wall-clock
// text without an offset ("2026-11-23T14:00"), so these helpers read that text as if it were UTC
// and format it in UTC: the digits come out unchanged, whatever zone the reader is in.

// Milliseconds in a minute, and minutes in an hour.
const MINUTE_MS = 60_000
const MINUTES_PER_HOUR = 60
// Under this many minutes, an answer counts as just fetched.
const FRESH_MINUTES = 1

// A wall-clock time or date from the server as a Date in UTC. A date alone gets midnight.
function wallClock(text: string): Date {
  // "2026-11-23" has no "T"; "2026-11-23T14:00" does.
  return new Date(text.includes('T') ? `${text}Z` : `${text}T00:00Z`)
}

// "2 PM" (or "14" where the reader's locale uses a 24-hour clock) for the hourly strip.
export function hourLabel(time: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(wallClock(time))
}

// "Mon" for the 7-day forecast.
export function weekdayLabel(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(wallClock(date))
}

// "Tue 25 Nov" or "Tue 25 Nov, 7:00 PM" for an event.
export function eventWhen(date: string, time: string | null, locale?: string): string {
  // The date part, always shown.
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  // Events without a set time show the date only.
  if (time === null) return day.format(wallClock(date))
  // The time part, from the date and time joined.
  const clock = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  const when = wallClock(`${date}T${time}`)
  return `${day.format(when)}, ${clock.format(when)}`
}

// The time right now in a place, such as "2:05 PM", for the card's header.
export function localClock(timezone: string, now: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(now)
}

// How old an answer is: "just now", "5 min ago" or "2 h ago", for the stale note.
export function ageLabel(fetchedAt: string, now: Date): string {
  // Whole minutes since the fetch; never below zero if the clocks disagree a little.
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(fetchedAt)) / MINUTE_MS))
  if (minutes < FRESH_MINUTES) return 'just now'
  // Under an hour, in minutes; from an hour, in whole hours.
  return minutes < MINUTES_PER_HOUR ? `${minutes} min ago` : `${Math.floor(minutes / MINUTES_PER_HOUR)} h ago`
}

// The place's region and country, for the line under the city name: "Ontario, Canada".
export function placeLine(region: string | null, country: string): string {
  return region ? `${region}, ${country}` : country
}
