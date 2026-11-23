// The bar across the top: the title, the city search and the °C/°F switch.

// The suggestion shape.
import type { Place } from '../../../shared/types.ts'
// The unit type.
import type { Unit } from '../units.ts'
// The search box.
import { Search } from './Search.tsx'

// The two units, in switch order.
const UNITS: Unit[] = ['C', 'F']

// What the page passes in.
interface TopBarProps {
  unit: Unit
  onUnit: (unit: Unit) => void
  savedIds: Set<number>
  onPick: (place: Place) => void
}

// The bar.
export function TopBar({ unit, onUnit, savedIds, onPick }: TopBarProps) {
  return (
    <header className="top-bar">
      <h1>Weather &amp; Events</h1>
      <Search savedIds={savedIds} onPick={onPick} />
      {/* Two buttons, the pressed one being the unit in use. */}
      <div className="unit-switch" role="group" aria-label="Temperature unit">
        {UNITS.map((option) => (
          <button key={option} type="button" aria-pressed={unit === option} onClick={() => onUnit(option)}>
            °{option}
          </button>
        ))}
      </div>
    </header>
  )
}
