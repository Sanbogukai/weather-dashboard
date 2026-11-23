// Changes to the list of cards made on the page at once, before the server answers, so a resize
// or a move shows without a wait. The server does the same change and its answer replaces this.

// The card shape.
import type { CardSize, Favourite } from '../../shared/types.ts'

// The list with one card moved to `to` (clamped to the ends), positions renumbered 0 to n−1.
export function moveCard(cards: Favourite[], id: number, to: number): Favourite[] {
  // The card being moved; an unknown id changes nothing.
  const card = cards.find((item) => item.id === id)
  if (!card) return cards
  // The others in order, with the moved card put back at its new place.
  const rest = cards.filter((item) => item.id !== id)
  const index = Math.min(Math.max(to, 0), rest.length)
  const moved = [...rest.slice(0, index), card, ...rest.slice(index)]
  // Each card's position is its place in the new list.
  return moved.map((item, position) => ({ ...item, position }))
}

// The list with one card's size changed.
export function resizeCard(cards: Favourite[], id: number, size: CardSize): Favourite[] {
  return cards.map((item) => (item.id === id ? { ...item, size } : item))
}

// The list without one card, positions renumbered.
export function removeCard(cards: Favourite[], id: number): Favourite[] {
  return cards.filter((item) => item.id !== id).map((item, position) => ({ ...item, position }))
}
