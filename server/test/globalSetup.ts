// Runs once before the whole test run: applies any migration the test database has not had
// yet, so the tests run against the schema in prisma/migrations. It never drops data; each
// test empties the tables itself (resetDb in helpers.ts).

// Runs a shell command and waits for it to finish.
import { execSync } from 'node:child_process';
// Refuses to touch any database that is not a test database.
import { testDatabaseUrl } from './testDatabase.ts';

export default function setup(): void {
  // Checked first, so a wrong DATABASE_URL stops the run before any migration runs.
  const url = testDatabaseUrl();
  // `migrate deploy` applies pending migrations only, the same command a live deploy runs.
  // prisma.config.ts prefers DIRECT_URL, so both point at the test database here.
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
