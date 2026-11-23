# Weather & Event Dashboard

Search for a city, save it as a favourite, and see its weather and upcoming events on a dashboard of cards.

Project 5 of a ten-project full-stack series. The new skill here is working with third-party APIs: a secret key kept in `.env` and never sent to the browser, upstream calls that can be slow or fail, and loading and error states for each part of the page.

Work in progress. The full README, with screenshots and the live link, comes at the end of the project.

## Stack

- TypeScript on both sides, React + Vite in the browser, Node + Express 5 on the server
- PostgreSQL 18 with Prisma 7 for favourites
- Weather from [Open-Meteo](https://open-meteo.com/), events from the Ticketmaster Discovery API
- Vitest + Supertest, GitHub Actions

## Run it locally

```
cd server
copy .env.example .env      # then fill in DATABASE_URL, and TICKETMASTER_API_KEY if you have one
npm install
npm run migrate
npm run dev
```

Weather data by Open-Meteo.com, under CC BY 4.0.
