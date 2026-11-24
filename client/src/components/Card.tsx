// One favourite city on the dashboard. The header shows at once from the saved place; the
// weather and holidays parts load on their own below it. The header's band takes its colour from
// the current weather, by day or night in that city.

// The shapes drawn here.
import type { CardSize, Favourite } from '../../../shared/types.ts'
// The two server calls a card makes.
import { fetchHolidays, fetchWeather } from '../api.ts'
// Loading, refresh and retry for each part.
import { useUpstream } from '../useUpstream.ts'
// The band's colour class.
import { bandClass } from '../tint.ts'
// The place line and local clock.
import { localClock, placeLine } from '../format.ts'
// The chosen temperature unit.
import type { Unit } from '../units.ts'
// The two parts.
import { WeatherPart } from './WeatherPart.tsx'
import { HolidaysPart } from './HolidaysPart.tsx'

// The size switch: the size, its letter and what a screen reader says.
const SIZES: Array<{ size: CardSize; letter: string; name: string }> = [
  { size: 'SMALL', letter: 'S', name: 'Small' },
  { size: 'MEDIUM', letter: 'M', name: 'Medium' },
  { size: 'LARGE', letter: 'L', name: 'Large' },
]

// What the page passes each card.
interface CardProps {
  card: Favourite
  // How many cards there are, so Move later knows the end.
  count: number
  unit: Unit
  now: Date
  onResize: (id: number, size: CardSize) => void
  onMove: (id: number, to: number) => void
  onRemove: (id: number) => void
}

// A card.
export function Card({ card, count, unit, now, onResize, onMove, onRemove }: CardProps) {
  // One key per place, so a part reloads only if the place itself changes.
  const placeKey = `${card.latitude},${card.longitude},${card.timezone},${card.countryCode}`
  // The two parts, each with its own loading, error and refresh.
  const weather = useUpstream(`weather:${placeKey}`, (signal) => fetchWeather(card, signal))
  const holidays = useUpstream(`holidays:${placeKey}`, (signal) => fetchHolidays(card, signal))
  // The band colour once the weather is in; a neutral band until then.
  const current = weather.value?.data.current
  const band = current ? bandClass(current.icon, current.isDay) : 'band-none'
  // The menu's element id, unique per card, which the menu button points at.
  const menuId = `card-menu-${card.id}`
  // Where this card can move to.
  const first = card.position === 0
  const last = card.position === count - 1

  return (
    <article className={`card size-${card.size.toLowerCase()}`} aria-label={card.name}>
      <header className={`band ${band}`}>
        <div className="band-text">
          <h2>{card.name}</h2>
          <p>
            {placeLine(card.region, card.country)} · <time>{localClock(card.timezone, now)}</time>
          </p>
        </div>
        <div className="card-tools">
          {/* S, M, L: the pressed one is the card's size. */}
          <div className="size-switch" role="group" aria-label="Card size">
            {SIZES.map(({ size, letter, name }) => (
              <button
                key={size}
                type="button"
                aria-label={`${name} card`}
                aria-pressed={card.size === size}
                onClick={() => onResize(card.id, size)}
              >
                {letter}
              </button>
            ))}
          </div>
          {/* The menu is a popover: the browser opens it, and closes it on Escape or a click outside. */}
          <button type="button" className="menu-button" popoverTarget={menuId} aria-label={`More for ${card.name}`}>
            ⋯
          </button>
          <div className="card-menu" id={menuId} popover="auto">
            <button type="button" disabled={first} popoverTarget={menuId} popoverTargetAction="hide" onClick={() => onMove(card.id, card.position - 1)}>
              Move earlier
            </button>
            <button type="button" disabled={last} popoverTarget={menuId} popoverTargetAction="hide" onClick={() => onMove(card.id, card.position + 1)}>
              Move later
            </button>
            <button type="button" className="danger" popoverTarget={menuId} popoverTargetAction="hide" onClick={() => onRemove(card.id)}>
              Remove
            </button>
          </div>
        </div>
      </header>
      <div className="card-body">
        <WeatherPart part={weather} size={card.size} unit={unit} now={now} />
        <HolidaysPart part={holidays} size={card.size} now={now} />
      </div>
    </article>
  )
}
