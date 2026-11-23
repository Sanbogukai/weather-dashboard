// The weather icons, drawn inline as small SVGs so the page needs no icon package. Each icon is
// built from a few shared shapes (sun, moon, cloud, drops), on a 24 × 24 grid. The sun and moon
// keep their own colours; clouds and precipitation use the text colour, so they suit both themes.

// The type of anything React can draw.
import type { ReactNode } from 'react'
// The icon names the server sends.
import type { WeatherIcon } from '../../../shared/types.ts'

// The sun: a disc with eight rays. Smaller and moved up-left when a cloud sits in front of it.
function Sun({ behind }: { behind: boolean }) {
  return (
    <g className="icon-sun" transform={behind ? 'translate(-3 -3) scale(0.75)' : undefined}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </g>
  )
}

// The moon: a crescent, also smaller when behind a cloud.
function Moon({ behind }: { behind: boolean }) {
  return (
    <path
      className="icon-moon"
      transform={behind ? 'translate(-2 -3) scale(0.75)' : undefined}
      d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
    />
  )
}

// A cloud, low in the frame when there is something under it.
function Cloud({ high }: { high: boolean }) {
  return (
    <path
      className="icon-cloud"
      transform={high ? 'translate(0 -3)' : undefined}
      d="M7 19h10.5a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.6A3.3 3.3 0 0 0 7 19z"
    />
  )
}

// Rain under a cloud: short strokes for drizzle, longer ones for rain.
function Drops({ heavy }: { heavy: boolean }) {
  return <path className="icon-drops" d={heavy ? 'M8 18l-1.5 4M12 18l-1.5 4M16 18l-1.5 4' : 'M8.5 19l-.8 2M12.5 19l-.8 2M16.5 19l-.8 2'} />
}

// Snowflakes under a cloud: three dots.
function Flakes() {
  return (
    <g className="icon-flakes">
      <circle cx="8" cy="20" r="1.1" />
      <circle cx="12" cy="22" r="1.1" />
      <circle cx="16" cy="20" r="1.1" />
    </g>
  )
}

// A lightning bolt under a cloud.
function Bolt() {
  return <path className="icon-bolt" d="M13 15l-3 4.5h3l-1.5 4L16 18h-3l1.5-3z" />
}

// Mist: three level lines.
function Mist() {
  return <path className="icon-drops" d="M4 10h16M6 14h12M4 18h16" />
}

// What each icon is made of.
const DRAWINGS: Record<WeatherIcon, () => ReactNode> = {
  'clear-day': () => <Sun behind={false} />,
  'clear-night': () => <Moon behind={false} />,
  'partly-cloudy-day': () => (
    <>
      <Sun behind />
      <Cloud high={false} />
    </>
  ),
  'partly-cloudy-night': () => (
    <>
      <Moon behind />
      <Cloud high={false} />
    </>
  ),
  cloudy: () => <Cloud high={false} />,
  fog: () => <Mist />,
  drizzle: () => (
    <>
      <Cloud high />
      <Drops heavy={false} />
    </>
  ),
  rain: () => (
    <>
      <Cloud high />
      <Drops heavy />
    </>
  ),
  snow: () => (
    <>
      <Cloud high />
      <Flakes />
    </>
  ),
  thunder: () => (
    <>
      <Cloud high />
      <Bolt />
    </>
  ),
}

// One icon. `label` is read out by screen readers; an icon next to its own label text passes ""
// so the condition is not read twice.
export function Icon({ name, label, className = '' }: { name: WeatherIcon; label: string; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      {DRAWINGS[name]()}
    </svg>
  )
}
