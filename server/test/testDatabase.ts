// Where the tests' database is, with a guard: the tests delete every row, so they must never
// run against the development or live database by mistake.

// The test database's name must end in this, e.g. weather_test.
const TEST_SUFFIX = '_test';

// Returns DATABASE_URL after checking that it names a test database.
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  // vitest.config.ts loads it from .env.test; CI sets it directly.
  if (!url) throw new Error('DATABASE_URL is not set; create server/.env.test');
  // The database name is the URL's path without the leading slash.
  const name = new URL(url).pathname.slice(1);
  // Anything else could be real data, so stop before a single row is touched.
  if (!name.endsWith(TEST_SUFFIX)) {
    throw new Error(`Refusing to run tests against "${name}": the name must end in ${TEST_SUFFIX}`);
  }
  // Safe to use.
  return url;
}
