// A card's weather. Every size shows the current conditions; Medium adds today's range,
// feels-like, wind and the 12-hour strip; Large adds the 7-day forecast.

// The shapes drawn here.
import type { CardSize, Weather } from '../../../shared/types.ts'
// The part's loading state and answer.
import type { Part } from '../useUpstream.ts'
// Degrees and wind in the chosen unit.
import { formatTemperature, formatWind, type Unit } from '../units.ts'
// Hour and weekday text.
import { hourLabel, weekdayLabel } from '../format.ts'
// The drawings.
import { Icon } from './Icon.tsx'
// Skeleton, error and stale note.
import { PartError, Skeleton, StaleNote } from './PartStatus.tsx'

// Skeleton heights per size, in text lines, so the card does not jump when the answer arrives.
const SMALL_LINES = 2
const MEDIUM_LINES = 4
const LARGE_LINES = 8
const SKELETON_LINES: Record<CardSize, number> = { SMALL: SMALL_LINES, MEDIUM: MEDIUM_LINES, LARGE: LARGE_LINES }

// The weather part of a card.
export function WeatherPart({ part, size, unit, now }: { part: Part<Weather>; size: CardSize; unit: Unit; now: Date }) {
  const { value, error, loading, retry } = part
  // Nothing yet: a skeleton while loading, the error once it failed.
  if (!value) return loading ? <Skeleton lines={SKELETON_LINES[size]} /> : <PartError error={error} part="weather" retry={retry} />
  // The answer, and its parts.
  const { current, hourly, daily } = value.data
  const [today] = daily
  return (
    <section className="weather" aria-label="Weather">
      {/* Now: icon, temperature, condition. */}
      <div className="now">
        <Icon name={current.icon} label="" className="now-icon" />
        <span className="now-temp">{formatTemperature(current.temperature, unit)}</span>
        <span className="now-label">{current.label}</span>
      </div>

      {/* Medium and Large: today's range, feels-like and wind, then the next 12 hours. */}
      {size !== 'SMALL' && (
        <>
          <dl className="facts">
            {today && (
              <div>
                <dt>High / low</dt>
                <dd>
                  {formatTemperature(today.high, unit)} / {formatTemperature(today.low, unit)}
                </dd>
              </div>
            )}
            <div>
              <dt>Feels like</dt>
              <dd>{formatTemperature(current.feelsLike, unit)}</dd>
            </div>
            <div>
              <dt>Wind</dt>
              <dd>{formatWind(current.windKmh, unit)}</dd>
            </div>
          </dl>
          <ol className="hours" aria-label="Next 12 hours">
            {hourly.map((hour) => (
              <li key={hour.time}>
                <span className="hour-time">{hourLabel(hour.time)}</span>
                <Icon name={hour.icon} label={hour.label} />
                <span className="hour-temp">{formatTemperature(hour.temperature, unit)}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Large: the week ahead, today first. */}
      {size === 'LARGE' && (
        <ol className="days" aria-label="Next 7 days">
          {daily.map((day, index) => (
            <li key={day.date}>
              <span className="day-name">{index === 0 ? 'Today' : weekdayLabel(day.date)}</span>
              <Icon name={day.icon} label={day.label} />
              <span className="day-range">
                <span>{formatTemperature(day.high, unit)}</span>
                <span className="muted">{formatTemperature(day.low, unit)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <StaleNote fetchedAt={value.fetchedAt} stale={value.stale} failed={error !== null} now={now} retry={retry} />
    </section>
  )
}
