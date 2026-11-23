// Settings for the Prisma CLI (generate, migrate). The app itself never reads this file.

// Checks whether a file is there.
import { existsSync } from 'node:fs';
// defineConfig only adds type checking to the settings object.
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env on its own, so this does, with Node's built-in loader. Values
// already set win, so a test run or CI that sets DATABASE_URL itself is not overridden.
// Render has no .env file, which is why the check is there.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  // Where the schema and the migrations live.
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations need a direct connection, not a pooled one. Neon gives both: DIRECT_URL is
    // set on Render, and locally there is no pooler, so DATABASE_URL serves for both. An empty
    // string lets `prisma generate` run where no database is configured, such as in CI's
    // install step; it never connects. `||` rather than `??`, because .env leaves DIRECT_URL
    // as an empty string, which must count as unset.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
