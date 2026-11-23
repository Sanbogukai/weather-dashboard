// The city search in the top bar. It asks the server for suggestions 300 ms after typing stops,
// shows them in a list (name, region, country), and adds the one picked by click or Enter.
// It follows the ARIA combobox pattern, so the arrow keys and a screen reader work too.

// React's hooks.
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
// The suggestion shape.
import type { Place } from '../../../shared/types.ts'
// The search call.
import { searchPlaces } from '../api.ts'
// The line under each name, and failure wording.
import { placeLine } from '../format.ts'
import { messageFor } from '../messages.ts'

// Wait this long after the last key before asking, in milliseconds.
const DEBOUNCE_MS = 300
// The server needs at least this many letters.
const MIN_LETTERS = 2

// Where the suggestion list stands.
type Status = 'idle' | 'loading' | 'ready' | 'error'

// What the page passes in.
interface SearchProps {
  // Places already on the dashboard, marked "Added" and not pickable again.
  savedIds: Set<number>
  // Adds a place.
  onPick: (place: Place) => void
}

// Whether an error is the abort of a request this component cancelled itself.
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// The search box with its suggestions.
export function Search({ savedIds, onPick }: SearchProps) {
  // What is typed.
  const [query, setQuery] = useState('')
  // The suggestions for the latest query, and where they stand.
  const [results, setResults] = useState<Place[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<unknown>(null)
  // The highlighted suggestion (arrow keys), or −1 for none.
  const [active, setActive] = useState(-1)
  // Whether the list is open; Escape and picking close it, typing opens it.
  const [open, setOpen] = useState(false)
  // Ids for the ARIA links between the box and the list.
  const listId = useId()

  // Asks for suggestions once typing pauses; a newer query cancels the older request.
  useEffect(() => {
    const text = query.trim()
    // Too short to search: nothing to show.
    if (text.length < MIN_LETTERS) {
      setResults([])
      setStatus('idle')
      return
    }
    const controller = new AbortController()
    // The request, sent after the pause.
    const ask = async () => {
      setStatus('loading')
      try {
        setResults(await searchPlaces(text, controller.signal))
        setStatus('ready')
        setActive(-1)
      } catch (failure) {
        // A newer query cancelled this one; it reports instead.
        if (isAbort(failure)) return
        setError(failure)
        setStatus('error')
      }
    }
    const timer = window.setTimeout(() => void ask(), DEBOUNCE_MS)
    // Typing again stops the pending wait and any request out.
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // Adds a suggestion, unless it is already saved, and empties the box.
  const pick = (place: Place | undefined) => {
    if (!place || savedIds.has(place.placeId)) return
    onPick(place)
    setQuery('')
    setOpen(false)
  }

  // What each key does while the box has focus.
  const KEYS: Record<string, () => void> = {
    // Down and Up move the highlight, wrapping at the ends.
    ArrowDown: () => setActive((index) => (index + 1) % Math.max(results.length, 1)),
    ArrowUp: () => setActive((index) => (index <= 0 ? results.length - 1 : index - 1)),
    // Enter adds the highlighted one, or the first when none is highlighted.
    Enter: () => pick(results[Math.max(active, 0)]),
    // Escape closes the list and keeps the text.
    Escape: () => setOpen(false),
  }

  // Runs the key's action, and stops its default (moving the caret, submitting).
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = KEYS[event.key]
    if (!action) return
    event.preventDefault()
    // Any key here also opens a closed list, except Escape, which closes it.
    setOpen(event.key !== 'Escape')
    action()
  }

  // The list shows while open and there is something to say.
  const showList = open && status !== 'idle'
  // The highlighted option's id, for aria-activedescendant.
  const activeId = active >= 0 ? `${listId}-${active}` : undefined

  return (
    <div className="search">
      <input
        type="search"
        placeholder="Add a city…"
        aria-label="Search for a city"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(true)}
      />
      {showList && (
        <ul className="suggestions" id={listId} role="listbox">
          {status === 'loading' && results.length === 0 && <li className="muted">Searching…</li>}
          {status === 'error' && <li className="muted">{messageFor(error, 'page')}</li>}
          {status === 'ready' && results.length === 0 && <li className="muted">No city by that name</li>}
          {results.map((place, index) => {
            const saved = savedIds.has(place.placeId)
            return (
              <li
                key={place.placeId}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={saved}
                className={index === active ? 'active' : undefined}
                // mousedown, not click: it fires before the box's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault()
                  pick(place)
                }}
              >
                <span className="suggestion-name">{place.name}</span>
                <span className="muted">{placeLine(place.region, place.country)}</span>
                {saved && <span className="tag">Added</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
