// The server's entry point: checks the environment, connects to the database, builds the app
// and starts listening. Node 26 runs this .ts file directly by stripping out the types; there
// is no build step. `npm start` and `npm run dev` load server/.env first with Node's
// --env-file-if-exists flag; on Render there is no file and the variables come from the
// dashboard instead.

// Builds the Express app with every route attached.
import { createApp } from './app.ts';
// Makes the Prisma client.
import { createDb } from './db.ts';
// Reads and checks the environment.
import { loadEnv } from './env.ts';
// The stale-owner clean-up and the length of a day.
import { DAY_MS, deleteStaleOwners } from './owners.ts';
// The events client, built only when there is a key.
import { createTicketmaster } from './ticketmaster.ts';

// Stops here, with every bad variable named, if the environment is wrong.
const env = loadEnv();

// Events need the Ticketmaster key; weather does not. Say so once, at start-up, without
// printing the key or its absence anywhere a visitor could see.
if (!env.TICKETMASTER_API_KEY) console.warn('TICKETMASTER_API_KEY is not set: events are off, weather still works');

// One client for the whole app.
const db = createDb(env.DATABASE_URL);
// The events client when the key is set, otherwise null, which the events route answers
// with 503 events_not_configured.
const ticketmaster = env.TICKETMASTER_API_KEY ? createTicketmaster({ apiKey: env.TICKETMASTER_API_KEY }) : null;
// The app over that database, with the real clock, Open-Meteo and cache (the defaults).
const app = createApp({ db, ticketmaster });

// Removes stale owners and logs how many. A failure is logged and the server keeps running;
// the next day's run tries again.
async function cleanUp(): Promise<void> {
  try {
    // Owners unseen for 30 days, with their favourites.
    const count = await deleteStaleOwners(db, new Date());
    console.log(`Removed ${count} owner(s) unseen for 30 days`);
  } catch (err) {
    console.error('Clean-up failed', err);
  }
}
// Once at start-up, then daily. unref() lets the process exit without waiting for the timer.
void cleanUp();
setInterval(cleanUp, DAY_MS).unref();

// Starts the HTTP server on the port; the callback runs once it is ready.
// Express 5 hands a failure (such as the port already being in use) to the callback instead
// of throwing, so the callback checks for one and stops the process rather than claiming
// to be listening.
app.listen(env.PORT, (error?: Error) => {
  // A busy port or similar: crash with the reason.
  if (error) throw error;
  // Confirms the server is up and where.
  console.log(`Listening on http://localhost:${env.PORT}`);
});
