// WMO weather codes, as Open-Meteo sends them, turned into a label for people and an icon name
// for the client. The full list of codes is at https://open-meteo.com/en/docs (search for
// "WMO Weather interpretation codes"). Clear and partly cloudy have a day and a night icon;
// the rest look the same at any hour.

// The icon names the client draws.
import type { WeatherIcon } from '../../shared/types.ts';

// The icon families. Two of them get a -day or -night ending; the rest are icon names already.
type IconBase = 'clear' | 'partly-cloudy' | Exclude<WeatherIcon, `${string}-day` | `${string}-night`>;

// One code's description.
interface CodeInfo {
  label: string;
  icon: IconBase;
}

// Code to description. The keys are text because the table is looked up with String(code),
// which keeps the codes themselves out of the code as bare numbers.
const CODES: Record<string, CodeInfo> = {
  '0': { label: 'Clear sky', icon: 'clear' },
  '1': { label: 'Mainly clear', icon: 'clear' },
  '2': { label: 'Partly cloudy', icon: 'partly-cloudy' },
  '3': { label: 'Overcast', icon: 'cloudy' },
  '45': { label: 'Fog', icon: 'fog' },
  '48': { label: 'Freezing fog', icon: 'fog' },
  '51': { label: 'Light drizzle', icon: 'drizzle' },
  '53': { label: 'Drizzle', icon: 'drizzle' },
  '55': { label: 'Heavy drizzle', icon: 'drizzle' },
  '56': { label: 'Light freezing drizzle', icon: 'drizzle' },
  '57': { label: 'Freezing drizzle', icon: 'drizzle' },
  '61': { label: 'Light rain', icon: 'rain' },
  '63': { label: 'Rain', icon: 'rain' },
  '65': { label: 'Heavy rain', icon: 'rain' },
  '66': { label: 'Light freezing rain', icon: 'rain' },
  '67': { label: 'Freezing rain', icon: 'rain' },
  '71': { label: 'Light snow', icon: 'snow' },
  '73': { label: 'Snow', icon: 'snow' },
  '75': { label: 'Heavy snow', icon: 'snow' },
  '77': { label: 'Snow grains', icon: 'snow' },
  '80': { label: 'Light showers', icon: 'rain' },
  '81': { label: 'Showers', icon: 'rain' },
  '82': { label: 'Violent showers', icon: 'rain' },
  '85': { label: 'Snow showers', icon: 'snow' },
  '86': { label: 'Heavy snow showers', icon: 'snow' },
  '95': { label: 'Thunderstorm', icon: 'thunder' },
  '96': { label: 'Thunderstorm with hail', icon: 'thunder' },
  '99': { label: 'Thunderstorm with heavy hail', icon: 'thunder' },
};

// What an unknown code shows: a plain cloud and an honest label. Open-Meteo has added codes
// before, so this keeps a new one from breaking the card.
const UNKNOWN: CodeInfo = { label: 'Unknown conditions', icon: 'cloudy' };

// The label and icon for a code. `isDay` picks the sun or the moon where it matters; daily
// entries have no hour, so they pass true.
export function describeWeather(code: number, isDay: boolean): { label: string; icon: WeatherIcon } {
  // The table entry, or the fallback.
  const info = CODES[String(code)] ?? UNKNOWN;
  // Only clear and partly cloudy change between day and night.
  if (info.icon === 'clear' || info.icon === 'partly-cloudy') {
    return { label: info.label, icon: `${info.icon}-${isDay ? 'day' : 'night'}` };
  }
  // Every other family is already a full icon name.
  return { label: info.label, icon: info.icon };
}
