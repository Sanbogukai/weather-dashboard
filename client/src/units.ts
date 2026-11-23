// °C or °F. The server always sends metric numbers; the page converts them here, at display time,
// so a cached answer never needs a second copy in the other unit.

// The two temperature units.
export type Unit = 'C' | 'F'

// Where the choice is kept, so it survives a reload.
export const UNIT_KEY = 'weather-dashboard.unit'

// °F = °C × 1.8 + 32.
const F_PER_C = 1.8
const F_AT_ZERO_C = 32
// 1 mile is 1.609344 km.
const KM_PER_MILE = 1.609344

// The part of localStorage used here, so a test can pass a Map-backed stand-in.
export interface UnitStorage {
  getItem(name: string): string | null
  setItem(name: string, value: string): void
}

// The stored unit; °C when nothing (or something unknown) is stored.
export function loadUnit(storage: UnitStorage): Unit {
  return storage.getItem(UNIT_KEY) === 'F' ? 'F' : 'C'
}

// Keeps the unit for next time.
export function saveUnit(storage: UnitStorage, unit: Unit): void {
  storage.setItem(UNIT_KEY, unit)
}

// A Celsius reading in the chosen unit, rounded to a whole degree.
export function convertTemperature(celsius: number, unit: Unit): number {
  // Math.round(-0.4) is -0, which would print as "-0"; adding 0 turns it into 0.
  return Math.round(unit === 'F' ? celsius * F_PER_C + F_AT_ZERO_C : celsius) + 0
}

// "31°": the unit letter is left to the switch in the top bar, as weather apps do.
export function formatTemperature(celsius: number, unit: Unit): string {
  return `${convertTemperature(celsius, unit)}°`
}

// "12 km/h" or "7 mph", following the temperature unit.
export function formatWind(kmh: number, unit: Unit): string {
  return unit === 'F' ? `${Math.round(kmh / KM_PER_MILE)} mph` : `${Math.round(kmh)} km/h`
}
