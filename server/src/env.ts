// Reads the server's settings from the environment once, checks them with Zod, and hands back
// a typed object. The rest of the code imports what this returns and never reads process.env,
// so a missing or malformed variable stops the server at start-up with a clear message rather
// than at the first request that needs it.

// Zod describes the expected shape and checks a value against it.
import { z } from 'zod';

// The port used when PORT is not set, as in local development.
const DEFAULT_PORT = 3000;
// The highest TCP port number.
const MAX_PORT = 65535;

// An empty variable (as `KEY=` in .env leaves it) means "not set", the same as a missing one.
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

// A required database URL: it must be there and must be a postgres:// or postgresql:// URL.
const databaseUrl = z
  .string({ error: 'is not set' })
  // Accepts text that starts with "postgres://" or "postgresql://": it matches
  // "postgresql://u:p@localhost:5432/weather_dev" and rejects "mysql://localhost/weather".
  // Try it: https://regex101.com/?flavor=javascript&regex=%5Epostgres(ql)%3F%3A%5C%2F%5C%2F&testString=postgresql%3A%2F%2Fu%3Ap%40localhost%3A5432%2Fweather_dev
  .regex(/^postgres(ql)?:\/\//, { error: 'must start with postgresql://' });

// Every variable the server reads, and what makes each one valid.
const EnvSchema = z.object({
  // Required: nothing works without the database.
  DATABASE_URL: databaseUrl,
  // Optional: Neon's direct URL, read by prisma.config.ts for migrations. Checked here too,
  // so a bad paste is caught when the server starts.
  DIRECT_URL: z.preprocess(blankToUndefined, databaseUrl.optional()),
  // Optional: without it, events are off and weather still works.
  TICKETMASTER_API_KEY: z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
  // Optional: the port, a whole number from 1 to 65535. Environment values are text, so
  // z.coerce turns "10000" into 10000 first.
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT)),
});

// The checked settings, typed from the schema.
export type Env = z.infer<typeof EnvSchema>;

// Checks `source` (process.env unless a test passes its own) and returns the settings, or
// throws one error naming every bad variable. The values themselves are never put in the
// message, since one of them may be a secret.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  // All good: the typed, defaulted values.
  if (result.success) return result.data;
  // One line per problem, such as "DATABASE_URL is not set".
  const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')} ${issue.message}`);
  throw new Error(`Bad environment; see server/.env.example:\n${lines.join('\n')}`);
}
