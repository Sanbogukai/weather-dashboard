// The colour family of a card's top band, picked from the weather icon and whether it is day
// or night in that city. index.css has one rule per family, in light and dark themes.

// The icon names the server sends.
import type { WeatherIcon } from '../../shared/types.ts'

// The band colours: five kinds of sky, each by day or by night.
export type Sky = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm'

// Which sky each icon belongs to. Partly cloudy reads as clear; fog as cloudy; drizzle as rain.
const SKY_OF: Record<WeatherIcon, Sky> = {
  'clear-day': 'clear',
  'clear-night': 'clear',
  'partly-cloudy-day': 'clear',
  'partly-cloudy-night': 'clear',
  cloudy: 'cloudy',
  fog: 'cloudy',
  drizzle: 'rain',
  rain: 'rain',
  snow: 'snow',
  thunder: 'storm',
}

// The class names for a card's band: "band-rain night", for example.
export function bandClass(icon: WeatherIcon, isDay: boolean): string {
  return `band-${SKY_OF[icon]} ${isDay ? 'day' : 'night'}`
}
