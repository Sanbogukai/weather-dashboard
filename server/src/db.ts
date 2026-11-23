// The one Prisma client the app uses, connected through the pg driver adapter.

// The typed client generated from prisma/schema.prisma (npm install runs prisma generate).
import { PrismaClient } from './generated/prisma/client.ts';
// Prisma 7 talks to Postgres through the plain `pg` driver, wrapped in this adapter.
import { PrismaPg } from '@prisma/adapter-pg';

// The client type, for functions that take the database as an argument (tests pass their own).
export type Db = PrismaClient;

// Builds a client for the given connection string. Tests call this with the test database's
// URL; the app calls it with DATABASE_URL.
export function createDb(connectionString: string): Db {
  // The adapter owns the connection pool; the client turns typed queries into SQL for it.
  const adapter = new PrismaPg({ connectionString });
  // The client that every query goes through.
  return new PrismaClient({ adapter });
}
