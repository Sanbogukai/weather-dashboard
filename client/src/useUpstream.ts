// One part of a card (its weather, or its holidays): loads when the card appears, refreshes on its
// own every 10 minutes while the page is visible, catches up when the tab is shown again, and
// can be retried by hand. A refresh keeps the old answer on screen until the new one arrives.

// React's hooks.
import { useCallback, useEffect, useRef, useState } from 'react'
// The wrapper the API puts around upstream data.
import type { Upstream } from '../../shared/types.ts'
// When a refresh is due.
import { isDue } from './refresh.ts'

// How often the part checks whether it is due, in milliseconds. A minute is precise enough for a
// 10-minute refresh and costs nothing when nothing is due.
const CHECK_MS = 60_000

// What a card draws from.
export interface Part<T> {
  // The latest answer, kept through later failures; null until the first one arrives.
  value: Upstream<T> | null
  // The latest failure, or null after a success.
  error: unknown
  // True while a request is out.
  loading: boolean
  // Asks again now.
  retry: () => void
}

// Whether the page can be seen right now.
function pageVisible(): boolean {
  return document.visibilityState === 'visible'
}

// Whether an error is the abort of a request this hook cancelled itself.
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

// Loads with `load`, again whenever `key` changes (another place) and on the refresh schedule.
export function useUpstream<T>(key: string, load: (signal: AbortSignal) => Promise<Upstream<T>>): Part<T> {
  // What the card shows.
  const [value, setValue] = useState<Upstream<T> | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  // The newest `load`, read when a request starts, so a new function each render starts nothing.
  const loadRef = useRef(load)
  // The request out now, to cancel when a newer one starts or the card goes away.
  const controllerRef = useRef<AbortController | null>(null)
  // When the last request started (ms since 1970), success or not, for the refresh schedule.
  const attemptedAtRef = useRef<number | null>(null)

  // Keeps loadRef on the latest function after each render.
  useEffect(() => {
    loadRef.current = load
  })

  // Starts a request, cancelling any still out.
  const run = useCallback(async () => {
    // Only the newest request may change what is shown.
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    // Noted at the start, so a failing part does not ask again every minute.
    attemptedAtRef.current = Date.now()
    setLoading(true)
    try {
      // The new answer replaces the old one and clears any error.
      setValue(await loadRef.current(controller.signal))
      setError(null)
    } catch (failure) {
      // A cancelled request is not a failure; the request that cancelled it reports instead.
      if (isAbort(failure)) return
      setError(failure)
    }
    // Reached only when this request was not cancelled.
    setLoading(false)
  }, [])

  // A new place: forget the old answer and load. Then check the schedule every minute and when
  // the tab is shown again.
  useEffect(() => {
    // Nothing from the previous place may show for this one.
    setValue(null)
    setError(null)
    attemptedAtRef.current = null
    void run()
    // Refreshes only when due and visible.
    const refreshIfDue = () => {
      if (isDue(attemptedAtRef.current, Date.now(), pageVisible())) void run()
    }
    // The minute check, and the catch-up when the tab comes back.
    const timer = window.setInterval(refreshIfDue, CHECK_MS)
    document.addEventListener('visibilitychange', refreshIfDue)
    // When the card goes away or the place changes: stop the timer, the listener and the request.
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfDue)
      controllerRef.current?.abort()
    }
  }, [key, run])

  // `run` returns a promise; the Retry button only needs it started.
  const retry = useCallback(() => void run(), [run])

  return { value, error, loading, retry }
}
