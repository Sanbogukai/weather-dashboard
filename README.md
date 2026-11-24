# Weather & Event Dashboard

Search for a city, save it as a favourite, and see its weather, the country's coming public holidays and festivals nearby on a dashboard of cards.

Project 5 of a ten-project full-stack series. The new skill here is working with third-party APIs: upstream calls that can be slow, rate-limited or fail, a cache in front of them, merging two sources into one answer, and loading and error states for each part of the page. None of the APIs needs a key.

Work in progress. The full README, with screenshots and the live link, comes at the end of the project.

## Stack

- TypeScript on both sides, React + Vite in the browser, Node + Express 5 on the server
- PostgreSQL 18 with Prisma 7 for favourites
- Weather and city search from [Open-Meteo](https://open-meteo.com/), public holidays from [Nager.Date](https://date.nager.at/), festivals within 50 km from [Wikidata](https://www.wikidata.org/)
- Vitest + Supertest, GitHub Actions

## Run it locally

```
cd server
copy .env.example .env      # then fill in DATABASE_URL
npm install
npm run migrate
npm run dev
```

Weather data by Open-Meteo.com, under CC BY 4.0. Holidays by Nager.Date, under the MIT licence. Festivals from Wikidata, under CC0.
