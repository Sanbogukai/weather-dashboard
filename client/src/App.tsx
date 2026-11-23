// The whole page: the top bar, the grid of cards and the footer. Resizing, moving and removing
// a card show at once and are undone if the server refuses them.

// React's hooks.
import { useCallback, useEffect, useMemo, useState } from 'react'
// The shapes the server sends.
import type { CardSize, Favourite, Place } from '../../shared/types.ts'
// The server calls this page makes.
import { addFavourite, deleteFavourite, listFavourites, startOver, updateFavourite } from './api.ts'
// Failure wording.
import { messageFor } from './messages.ts'
// The changes shown before the server answers.
import { moveCard, removeCard, resizeCard } from './order.ts'
// The temperature unit, kept in localStorage.
import { loadUnit, saveUnit, type Unit } from './units.ts'
// The page's parts.
import { TopBar } from './components/TopBar.tsx'
import { Card } from './components/Card.tsx'
import { EmptyState } from './components/EmptyState.tsx'
import { Footer } from './components/Footer.tsx'

// How long a toast message stays up, in milliseconds.
const TOAST_MS = 4000
// How often the cards' local clocks move on: once a minute.
const CLOCK_MS = 60_000
// The size a newly added card starts at.
const NEW_CARD_SIZE: CardSize = 'MEDIUM'

// Where the first load stands.
type LoadState = 'loading' | 'ready' | 'error'

// The current time, moved on once a minute, for the local clocks and the "Updated … ago" notes.
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  // A timer for as long as the page is up.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

// The page.
export default function App() {
  // The cards in order.
  const [cards, setCards] = useState<Favourite[]>([])
  // The first load's state, and its failure.
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<unknown>(null)
  // °C or °F, read once from localStorage.
  const [unit, setUnit] = useState<Unit>(() => loadUnit(window.localStorage))
  // A short message at the bottom of the screen, or '' for none.
  const [toast, setToast] = useState('')
  // The clock the cards share.
  const now = useNow()

  // Loads the cards, replacing what is shown.
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setCards(await listFavourites(signal))
      setLoadState('ready')
    } catch (failure) {
      // The page went away or loaded again; nothing to report.
      if (signal?.aborted) return
      setLoadError(failure)
      setLoadState('error')
    }
  }, [])

  // The first load, cancelled if the page goes away first.
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  // Hides the toast after a while; a newer message restarts the wait.
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Shows a failure as a toast.
  const report = (failure: unknown) => setToast(messageFor(failure, 'page'))

  // Changes the unit and keeps it.
  const changeUnit = (next: Unit) => {
    setUnit(next)
    saveUnit(window.localStorage, next)
  }

  // Adds a picked city as the last card. A repeat (409) or a 13th card (422) shows the server's message.
  const add = async (place: Place) => {
    try {
      const card = await addFavourite(place, NEW_CARD_SIZE)
      setCards((list) => [...list, card])
    } catch (failure) {
      report(failure)
    }
  }

  // Runs a change on screen at once, then on the server; puts the old list back if the server refuses.
  const optimistic = async (change: (list: Favourite[]) => Favourite[], send: () => Promise<unknown>) => {
    // The list as it was, to put back on failure.
    const before = cards
    setCards(change(before))
    try {
      await send()
    } catch (failure) {
      setCards(before)
      report(failure)
    }
  }

  // The three card actions.
  const resize = (id: number, size: CardSize) => void optimistic((list) => resizeCard(list, id, size), () => updateFavourite(id, { size }))
  const move = (id: number, to: number) => void optimistic((list) => moveCard(list, id, to), () => updateFavourite(id, { position: to }))
  const remove = (id: number) => void optimistic((list) => removeCard(list, id), () => deleteFavourite(id))

  // A new dashboard with the samples, then its cards.
  const restart = async () => {
    try {
      await startOver()
      await load()
    } catch (failure) {
      report(failure)
    }
  }

  // The places already saved, for the search's "Added" marks.
  const savedIds = useMemo(() => new Set(cards.map((card) => card.placeId)), [cards])

  return (
    <div className="page">
      <TopBar unit={unit} onUnit={changeUnit} savedIds={savedIds} onPick={(place) => void add(place)} />
      <main>
        {loadState === 'loading' && <p className="page-note">Loading your cities…</p>}
        {loadState === 'error' && (
          <p className="page-note" role="alert">
            {messageFor(loadError, 'page')}{' '}
            <button type="button" className="link-button" onClick={() => void load()}>
              Retry
            </button>
          </p>
        )}
        {loadState === 'ready' && cards.length === 0 && <EmptyState onStartOver={() => void restart()} />}
        {loadState === 'ready' && cards.length > 0 && (
          <div className="grid">
            {cards.map((card) => (
              <Card
                key={card.id}
                card={card}
                count={cards.length}
                unit={unit}
                now={now}
                onResize={resize}
                onMove={move}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </main>
      <Footer onStartOver={() => void restart()} />
      {/* Read out by screen readers when it changes. */}
      <div className="toast" role="status" aria-live="polite" hidden={!toast}>
        {toast}
      </div>
    </div>
  )
}
