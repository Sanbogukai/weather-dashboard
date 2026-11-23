// What the dashboard shows with no cards: a nudge to search, and the samples one click away.

// The empty dashboard.
export function EmptyState({ onStartOver }: { onStartOver: () => void }) {
  return (
    <div className="empty">
      <h2>No cities yet</h2>
      <p>Search for a city above to add its card.</p>
      <button type="button" onClick={onStartOver}>
        Start over with the sample cities
      </button>
    </div>
  )
}
