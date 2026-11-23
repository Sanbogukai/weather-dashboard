# Test fixtures

Upstream answers the tests feed to the clients through a fake `fetch`, so no test reaches the
network.

| File | Source |
| ---- | ------ |
| `geocoding-manila.json` | Recorded from Open-Meteo geocoding, `name=Manila&count=8`, on 2026-11-23. |
| `geocoding-none.json` | Recorded from Open-Meteo geocoding for a name with no match. |
| `forecast-manila.json` | Recorded from the Open-Meteo forecast for Manila, with the fields `openMeteo.ts` asks for, on 2026-11-23. |
| `ticketmaster-events.json` | Hand-written in the shape of Ticketmaster's Discovery API documentation, with fake ids and URLs, until the API key arrives. Replace it with a recorded answer (key removed) then. |
| `ticketmaster-none.json` | Hand-written: the answer for a search with no events, which has no `_embedded`. |
| `ticketmaster-quota.json` | Hand-written: the body Ticketmaster sends with its `429` quota error. |
