// The footer: credit to the three data sources, as their terms ask, and Start over.

// The footer.
export function Footer({ onStartOver }: { onStartOver: () => void }) {
  return (
    <footer className="footer">
      <p>
        Weather data by{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo.com
        </a>
        {' · '}Holidays from{' '}
        <a href="https://date.nager.at/" target="_blank" rel="noreferrer">
          Nager.Date
        </a>
        {' · '}Festivals from{' '}
        <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">
          Wikidata
        </a>
      </p>
      {/* A new dashboard with the sample cities; the old one is left for the server's clean-up. */}
      <button type="button" className="link-button" onClick={onStartOver}>
        Start over
      </button>
    </footer>
  )
}
