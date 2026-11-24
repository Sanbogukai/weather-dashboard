// Favourite queries: list, add, resize, move and remove. Every query is scoped to one owner, so
// an id that belongs to someone else behaves exactly like an id that does not exist.
//
// Positions always run 0, 1, 2 ... with no gaps: adding puts the new city last, moving shifts
// the cities in between by one, and removing closes the gap.

// The Prisma namespace holds the error class for a broken unique rule.
import { Prisma } from './generated/prisma/client.ts';
// The database client type.
import type { Db } from './db.ts';
// The shapes sent to the client.
import type { CardSize, Favourite, Place } from '../../shared/types.ts';

// The most favourites one owner may keep. A dashboard of 12 cards is already a long page, and
// each card costs two upstream calls when it opens.
export const FAVOURITES_MAX = 12;

// Prisma's error code for a broken unique rule: here, the same place saved twice by one owner.
const UNIQUE_VIOLATION = 'P2002';

// The columns a Favourite is read from; ownerId and createdAt stay on the server.
const FAVOURITE_COLUMNS = {
  id: true,
  placeId: true,
  name: true,
  region: true,
  country: true,
  countryCode: true,
  latitude: true,
  longitude: true,
  timezone: true,
  size: true,
  position: true,
} as const;

// What addFavourite can come back with: the new favourite, or why there is none.
export type AddResult = { created: Favourite } | { duplicate: true } | { full: true };

// What updateFavourite may change; either or both.
export interface FavouriteChanges {
  size?: CardSize;
  position?: number;
}

// True when the error is Postgres refusing a second row for the same owner and place.
function isUniqueViolation(err: unknown): boolean {
  // Prisma wraps database errors in this class and keeps the database's reason as a code.
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION;
}

// The owner's favourites in dashboard order.
export async function listFavourites(db: Db, ownerId: number): Promise<Favourite[]> {
  // The index on (ownerId, position) makes this one quick lookup.
  return db.favourite.findMany({ where: { ownerId }, orderBy: { position: 'asc' }, select: FAVOURITE_COLUMNS });
}

// Saves a place as the owner's last card. Refuses a place already saved, and a 13th card.
export async function addFavourite(
  db: Db,
  ownerId: number,
  place: Place,
  size: CardSize,
  now: Date,
): Promise<AddResult> {
  try {
    // The count and the insert run in one transaction, so the new card's position matches the
    // number of cards it was counted against.
    return await db.$transaction(async (tx) => {
      // How many cards the owner has now; the new one goes after them.
      const count = await tx.favourite.count({ where: { ownerId } });
      // A full dashboard takes no more.
      if (count >= FAVOURITES_MAX) return { full: true } as const;
      // The new card, last in the order.
      const created = await tx.favourite.create({
        data: { ...place, ownerId, size, position: count, createdAt: now },
        select: FAVOURITE_COLUMNS,
      });
      // Sent back so the client can draw the card without asking again.
      return { created };
    });
  } catch (err) {
    // The unique rule on (ownerId, placeId) catches a repeat, even two sent at the same moment.
    if (isUniqueViolation(err)) return { duplicate: true };
    // Anything else is a real failure for the error handler.
    throw err;
  }
}

// Changes a card's size, its position, or both. Returns the updated card, or null when the
// owner has no card with this id. A position past the end means last.
export async function updateFavourite(
  db: Db,
  ownerId: number,
  id: number,
  changes: FavouriteChanges,
): Promise<Favourite | null> {
  // One transaction, so a move never leaves two cards sharing a position.
  return db.$transaction(async (tx) => {
    // The owner's card ids in their current order.
    const order = await tx.favourite.findMany({
      where: { ownerId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    // Where the card is now; -1 when the owner has no such card.
    const from = order.findIndex((row) => row.id === id);
    // Not this owner's card, or no card at all: the route answers 404.
    if (from === -1) return null;

    // A new size is a single-row update.
    if (changes.size !== undefined) {
      await tx.favourite.update({ where: { id }, data: { size: changes.size } });
    }

    // A move takes the card out of the list and puts it back at the new index.
    if (changes.position !== undefined) {
      // The largest valid index; a larger request is read as "last".
      const to = Math.min(changes.position, order.length - 1);
      // splice removes the card and returns it in a one-item list.
      const [moved] = order.splice(from, 1);
      // splice again inserts it at the new index without removing anything.
      if (moved) order.splice(to, 0, moved);
      // Every card whose index changed gets its new position; the others are left alone.
      await Promise.all(
        order.map((row, position) => tx.favourite.updateMany({ where: { id: row.id, NOT: { position } }, data: { position } })),
      );
    }

    // The card as it is now, with its new size and position.
    return tx.favourite.findUnique({ where: { id }, select: FAVOURITE_COLUMNS });
  });
}

// Removes a card and closes the gap it leaves. Returns false when the owner has no such card.
export async function deleteFavourite(db: Db, ownerId: number, id: number): Promise<boolean> {
  return db.$transaction(async (tx) => {
    // Looked up with the owner in the filter, so another owner's card is not found. Its
    // position is kept for closing the gap below.
    const card = await tx.favourite.findFirst({ where: { id, ownerId }, select: { position: true } });
    // Not this owner's card: the route answers 404.
    if (card === null) return false;
    // The card itself.
    await tx.favourite.delete({ where: { id } });
    // Every card after it moves up one place, so positions stay 0 to n-1.
    await tx.favourite.updateMany({
      where: { ownerId, position: { gt: card.position } },
      data: { position: { decrement: 1 } },
    });
    // Removed.
    return true;
  });
}
