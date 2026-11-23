// The page's plain logic: units, time text, error wording, band colours, card order, refresh timing.
import { describe, expect, it } from 'vitest'
// The shapes the helpers work on.
import type { Favourite } from '../../shared/types.ts'
// The code under test.
import { convertTemperature, formatTemperature, formatWind, loadUnit, saveUnit, UNIT_KEY } from './units.ts'
import { ageLabel, eventWhen, hourLabel, localClock, placeLine, weekdayLabel } from './format.ts'
import { messageFor } from './messages.ts'
import { ApiError, UNREACHABLE } from './errors.ts'
import { bandClass } from './tint.ts'
import { moveCard, removeCard, resizeCard } from './order.ts'
import { isDue, REFRESH_MS } from './refresh.ts'

// A fixed locale, so the expected text does not depend on the machine running the tests.
const LOCALE = 'en-US'
// Freezing, boiling and a mild day, in °C, with their °F values.
const FREEZING_C = 0
const FREEZING_F = 32
const BOILING_C = 100
const BOILING_F = 212
const MILD_C = 21.6
const MILD_ROUNDED = 22
// Just below zero, which must not print as "-0".
const NEARLY_ZERO_C = -0.4
// 100 km/h is 62 mph.
const FAST_KMH = 100
const FAST_MPH = 62
// The status Vite's proxy answers with when the API server is down.
const BAD_GATEWAY = 502
// A moment for the age and refresh tests, and two earlier ones.
const NOW = new Date('2026-11-23T12:00:00Z')
const FIVE_MIN_AGO = '2026-11-23T11:55:00.000Z'
const TWO_HOURS_AGO = '2026-11-23T10:00:00.000Z'

// A Map-backed stand-in for localStorage.
function memoryStorage() {
  const map = new Map<string, string>()
  return { getItem: (name: string) => map.get(name) ?? null, setItem: (name: string, value: string) => void map.set(name, value) }
}

// Three cards, positions 0 to 2.
const CARDS: Favourite[] = ['Manila', 'Ottawa', 'Tokyo'].map((name, position) => ({
  id: position + 1,
  placeId: position + 1,
  name,
  region: null,
  country: 'Somewhere',
  latitude: 0,
  longitude: 0,
  timezone: 'UTC',
  size: 'MEDIUM',
  position,
}))
// The ids of the three cards, in list order.
const [MANILA, OTTAWA, TOKYO] = CARDS.map((card) => card.id)
const FAR_END = 99

// The names in list order, with positions checked to run 0 to n−1.
function names(cards: Favourite[]): string[] {
  expect(cards.map((card) => card.position)).toEqual(cards.map((_card, index) => index))
  return cards.map((card) => card.name)
}

describe('units', () => {
  it('converts and rounds Celsius to Fahrenheit', () => {
    expect(convertTemperature(FREEZING_C, 'F')).toBe(FREEZING_F)
    expect(convertTemperature(BOILING_C, 'F')).toBe(BOILING_F)
    expect(convertTemperature(MILD_C, 'C')).toBe(MILD_ROUNDED)
  })

  it('never shows minus zero', () => {
    expect(formatTemperature(NEARLY_ZERO_C, 'C')).toBe('0°')
  })

  it('gives wind in km/h or mph to follow the unit', () => {
    expect(formatWind(FAST_KMH, 'C')).toBe(`${FAST_KMH} km/h`)
    expect(formatWind(FAST_KMH, 'F')).toBe(`${FAST_MPH} mph`)
  })

  it('keeps the choice, and falls back to °C for anything unknown', () => {
    const storage = memoryStorage()
    expect(loadUnit(storage)).toBe('C')
    saveUnit(storage, 'F')
    expect(loadUnit(storage)).toBe('F')
    storage.setItem(UNIT_KEY, 'K')
    expect(loadUnit(storage)).toBe('C')
  })
})

describe('format', () => {
  it('reads the server times as wall-clock text', () => {
    expect(hourLabel('2026-11-23T14:00', LOCALE)).toBe('2 PM')
    expect(weekdayLabel('2026-11-23', LOCALE)).toBe('Mon')
  })

  it('writes event dates with and without a time', () => {
    expect(eventWhen('2026-11-25', '19:00', LOCALE)).toBe('Wed, Nov 25, 7:00 PM')
    expect(eventWhen('2026-11-25', null, LOCALE)).toBe('Wed, Nov 25')
  })

  it("tells a place's own time", () => {
    expect(localClock('Asia/Manila', NOW, LOCALE)).toBe('8:00 PM')
  })

  it('says how old an answer is', () => {
    expect(ageLabel(NOW.toISOString(), NOW)).toBe('just now')
    expect(ageLabel(FIVE_MIN_AGO, NOW)).toBe('5 min ago')
    expect(ageLabel(TWO_HOURS_AGO, NOW)).toBe('2 h ago')
  })

  it('leaves out a missing region', () => {
    expect(placeLine('Ontario', 'Canada')).toBe('Ontario, Canada')
    expect(placeLine(null, 'Japan')).toBe('Japan')
  })
})

describe('messages', () => {
  it('names the service that failed', () => {
    const slow = new ApiError('x', BAD_GATEWAY, 'upstream_timeout')
    expect(messageFor(slow, 'weather')).toBe('The weather service is slow right now')
    expect(messageFor(slow, 'events')).toBe('The events service is slow right now')
  })

  it("uses the server's message for codes it has no wording for", () => {
    expect(messageFor(new ApiError('Manila is already on your dashboard', 0, 'duplicate'), 'page')).toBe(
      'Manila is already on your dashboard',
    )
  })

  it('treats no answer and a network error alike', () => {
    expect(messageFor(new ApiError('x', BAD_GATEWAY, UNREACHABLE), 'page')).toBe("Can't reach the server")
    expect(messageFor(new TypeError('Failed to fetch'), 'page')).toBe("Can't reach the server")
  })
})

describe('bandClass', () => {
  it('groups icons into skies, by day or night', () => {
    expect(bandClass('partly-cloudy-night', false)).toBe('band-clear night')
    expect(bandClass('drizzle', true)).toBe('band-rain day')
    expect(bandClass('thunder', true)).toBe('band-storm day')
  })
})

describe('order', () => {
  it('moves a card and renumbers the rest', () => {
    expect(names(moveCard(CARDS, TOKYO ?? 0, 0))).toEqual(['Tokyo', 'Manila', 'Ottawa'])
    expect(names(moveCard(CARDS, MANILA ?? 0, FAR_END))).toEqual(['Ottawa', 'Tokyo', 'Manila'])
  })

  it('changes nothing for an unknown card', () => {
    expect(moveCard(CARDS, FAR_END, 0)).toBe(CARDS)
  })

  it('resizes one card and removes another', () => {
    expect(resizeCard(CARDS, OTTAWA ?? 0, 'LARGE').map((card) => card.size)).toEqual(['MEDIUM', 'LARGE', 'MEDIUM'])
    expect(names(removeCard(CARDS, MANILA ?? 0))).toEqual(['Ottawa', 'Tokyo'])
  })
})

describe('isDue', () => {
  it('refreshes after the interval, and never while hidden', () => {
    const now = NOW.getTime()
    expect(isDue(null, now, true)).toBe(true)
    expect(isDue(now - REFRESH_MS + 1, now, true)).toBe(false)
    expect(isDue(now - REFRESH_MS, now, true)).toBe(true)
    expect(isDue(null, now, false)).toBe(false)
  })
})
