// The footer: credit to the two data sources, as their terms ask, and Start over.

// The footer.
export function Footer({ onStartOver }: { onStartOver: () => void }) {
  return (
    <footer className="footer">
      <p>
        Weather data by{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo.com
        </a>
        {' · '}Events from{' '}
        <a href="https://www.ticketmaster.com/" target="_blank" rel="noreferrer">
          Ticketmaster
        </a>
      </p>
      {/* A new dashboard with the sample cities; the old one is left for the server's clean-up. */}
      <button type="button" className="link-button" onClick={onStartOver}>
        Start over
      </button>
    </footer>
  )
}
