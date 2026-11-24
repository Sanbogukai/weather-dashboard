// A card's holidays and festivals. Small and Medium cards show the next one on one line; Large
// cards list them all (up to 6) with the date, a Regional tag on holidays kept only in some
// states or provinces, and the distance to a festival. A festival links to its page.

// The shapes drawn here.
import type { CardSize, Holiday } from '../../../shared/types.ts'
// The part's loading state and answer.
import type { Part } from '../useUpstream.ts'
// "Wed, Nov 25" or "Wed, Nov 25 – Sun, Nov 29".
import { dayRange } from '../format.ts'
// Skeleton, error and stale note.
import { PartError, Skeleton, StaleNote } from './PartStatus.tsx'

// Skeleton heights per size, in text lines: one for the next-one line, more for the list.
const LINE_LINES = 1
const LIST_LINES = 4
const SKELETON_LINES: Record<CardSize, number> = { SMALL: LINE_LINES, MEDIUM: LINE_LINES, LARGE: LIST_LINES }

// The name, as a link when there is a page to open in a new tab.
function HolidayName({ holiday }: { holiday: Holiday }) {
  if (holiday.url === null) return <span>{holiday.name}</span>
  return (
    <a href={holiday.url} target="_blank" rel="noreferrer">
      {holiday.name}
    </a>
  )
}

// The small grey details after the date: the local name, Regional, or the festival's distance.
function details(holiday: Holiday): string {
  // Each detail that applies, in a fixed order, joined with dots.
  const parts = [
    holiday.localName,
    holiday.regional ? 'Regional' : null,
    holiday.distanceKm === null ? null : `Festival, ${holiday.distanceKm} km away`,
  ]
  return parts.filter((part) => part !== null).join(' · ')
}

// The holidays part of a card.
export function HolidaysPart({ part, size, now }: { part: Part<Holiday[]>; size: CardSize; now: Date }) {
  const { value, error, loading, retry } = part
  // Nothing yet: a skeleton while loading, the error once it failed.
  if (!value) {
    if (loading) return <Skeleton lines={SKELETON_LINES[size]} />
    return <PartError error={error} part="holidays" retry={retry} />
  }
  // Holidays and festivals together, soonest first.
  const holidays = value.data
  const [next] = holidays
  return (
    <section className="holidays" aria-label="Holidays and festivals">
      {/* A country the holidays service does not cover, and no festival nearby. */}
      {!next && <p className="muted">Holidays aren't available here</p>}

      {/* Small and Medium: the next one only. */}
      {next && size !== 'LARGE' && (
        <p className="next-holiday">
          <span className="muted">Next: </span>
          <HolidayName holiday={next} />
          <span className="muted"> · {dayRange(next.date, next.endDate)}</span>
        </p>
      )}

      {/* Large: the list. */}
      {next && size === 'LARGE' && (
        <>
          <h3>Holidays & festivals</h3>
          <ul className="holiday-list">
            {holidays.map((holiday) => (
              <li key={holiday.id}>
                <HolidayName holiday={holiday} />
                <span className="muted">
                  {dayRange(holiday.date, holiday.endDate)}
                  {details(holiday) && ` · ${details(holiday)}`}
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
