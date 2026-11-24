# Test fixtures

Upstream answers the tests feed to the clients through a fake `fetch`, so no test reaches the
network.

| File | Source |
| ---- | ------ |
| `geocoding-manila.json` | Recorded from Open-Meteo geocoding, `name=Manila&count=8`, on 2026-11-23. |
| `geocoding-none.json` | Recorded from Open-Meteo geocoding for a name with no match. |
| `forecast-manila.json` | Recorded from the Open-Meteo forecast for Manila, with the fields `openMeteo.ts` asks for, on 2026-11-23. |
| `nager-canada.json` | Recorded from Nager.Date, `NextPublicHolidays/CA`, on 2026-11-24. Canada has both nationwide and provincial holidays, so it covers the Regional tag. |
| `wikidata-festivals.json` | Recorded from the Wikidata query service on 2026-11-24, with the query `festivalQuery` builds for Tokyo (35.69, 139.69) from 2026-11-23 to 2027-11-23. One festival in two rows (one per start date), which covers the de-duplication. Wikidata has few dated festivals with coordinates, so most cities get none. |
