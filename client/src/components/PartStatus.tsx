// The small states every card part shares: a skeleton while the first answer is on its way, an
// error with Retry when there is nothing to show, and an "Updated … ago" note when what is shown
// is old (the server served a stale copy, or the latest refresh failed).

// How a failure reads.
import { messageFor, type Part as PartName } from '../messages.ts'
// "5 min ago".
import { ageLabel } from '../format.ts'

// Grey bars in the shape of the content to come. `lines` sets how many.
export function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_unused, index) => (
        <span key={index} />
      ))}
    </div>
  )
}

// The failure message for a part, with Retry. `retry` is left out where asking again cannot help.
export function PartError({ error, part, retry }: { error: unknown; part: PartName; retry?: () => void }) {
  return (
    <p className="part-error" role="status">
      <span>{messageFor(error, part)}</span>
      {retry && (
        <button type="button" className="link-button" onClick={retry}>
          Retry
        </button>
      )}
    </p>
  )
}

// "Updated 2 h ago", shown only when the answer is old; with Retry when the refresh failed.
export function StaleNote({
  fetchedAt,
  stale,
  failed,
  now,
  retry,
}: {
  fetchedAt: string
  stale: boolean
  failed: boolean
  now: Date
  retry: () => void
}) {
  // A fresh answer needs no note.
  if (!stale && !failed) return null
  return (
    <p className="stale-note">
      <span>Updated {ageLabel(fetchedAt, now)}</span>
      {failed && (
        <button type="button" className="link-button" onClick={retry}>
          Retry
        </button>
      )}
    </p>
  )
}
