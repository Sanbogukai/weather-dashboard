// A card's events. Small and Medium cards show the next event on one line; Large cards list
// them all (up to 6) with date, time and venue. Each links to its Ticketmaster page.

// The shapes drawn here.
import type { CardSize, EventItem } from '../../../shared/types.ts'
// The part's loading state and answer.
import type { Part } from '../useUpstream.ts'
// The error type, to spot the server running without a Ticketmaster key.
import { ApiError } from '../errors.ts'
// "Wed, Nov 25, 7:00 PM".
import { eventWhen } from '../format.ts'
// Skeleton, error and stale note.
import { PartError, Skeleton, StaleNote } from './PartStatus.tsx'

// Skeleton heights per size, in text lines: one for the next-event line, more for the list.
const LINE_LINES = 1
const LIST_LINES = 4
const SKELETON_LINES: Record<CardSize, number> = { SMALL: LINE_LINES, MEDIUM: LINE_LINES, LARGE: LIST_LINES }

// One event as a link that opens Ticketmaster in a new tab.
function EventLink({ event }: { event: EventItem }) {
  return (
    <a href={event.url} target="_blank" rel="noreferrer">
      {event.name}
    </a>
  )
}

// The events part of a card.
export function EventsPart({ part, size, now }: { part: Part<EventItem[]>; size: CardSize; now: Date }) {
  const { value, error, loading, retry } = part
  // Without a key the server answers 503 events_not_configured; asking again cannot help.
  const off = error instanceof ApiError && error.code === 'events_not_configured'
  // Nothing yet: a skeleton while loading, the error once it failed.
  if (!value) {
    if (loading) return <Skeleton lines={SKELETON_LINES[size]} />
    return <PartError error={error} part="events" retry={off ? undefined : retry} />
  }
  // The events, soonest first.
  const events = value.data
  const [next] = events
  return (
    <section className="events" aria-label="Events nearby">
      {/* No events within 50 km in the next 14 days, or Ticketmaster does not cover the area. */}
      {!next && <p className="muted">Events aren't available here</p>}

      {/* Small and Medium: the next event only. */}
      {next && size !== 'LARGE' && (
        <p className="next-event">
          <span className="muted">Next: </span>
          <EventLink event={next} />
          <span className="muted"> · {eventWhen(next.date, next.time)}</span>
        </p>
      )}

      {/* Large: the list. */}
      {next && size === 'LARGE' && (
        <>
          <h3>Events nearby</h3>
          <ul className="event-list">
            {events.map((event) => (
              <li key={event.id}>
                <EventLink event={event} />
                <span className="muted">
                  {eventWhen(event.date, event.time)}
                  {event.venue && ` · ${event.venue}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <StaleNote fetchedAt={value.fetchedAt} stale={value.stale} failed={error !== null} now={now} retry={retry} />
    </section>
  )
}
