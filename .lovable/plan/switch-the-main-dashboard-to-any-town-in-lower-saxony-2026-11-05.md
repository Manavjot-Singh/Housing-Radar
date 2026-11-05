# Switch the main dashboard to any town in Lower Saxony

## Goal
After you search a town on "Andere Gemeinde" and press proceed, the main map page (Karte) shows that town instead of Lüneburg: districts, 500 m blocks, 100 m squares, analyses, ideas and Future Development. A "Back to Lüneburg" button switches back.

## What the new town gets

| Part of the dashboard | Data for the new town | Status |
|---|---|---|
| Residents, living space per person, vacancy, 65+, building type, rooms | Census 2022 100 m grid, prepared once for all of Lower Saxony and split per town | Works like Lüneburg |
| District borders | OpenStreetMap (suburbs/districts), loaded live | Works; small towns without districts get one "whole town" area |
| Built-up share, residents per building | ALKIS building outlines (already loaded live) | Works |
| Amenities (supermarket, bakery, doctor, stops) | OpenStreetMap, loaded live | Works, but **straight-line** distance (walking routes take too long to calculate live) |
| Future Development screening | Nature reserves, landscape protection (live) + forest, cemeteries, allotments, car parks, parks from OpenStreetMap | Works; flood zones are added if the state service answers in time |
| Land-use plan (blue areas) | Only exists for Lüneburg | Hidden for other towns |
| Shop vacancy + "housing and shop vacancy" analysis | Only Lüneburg's list | Hidden for other towns |

Loading a new town takes about 30–90 seconds. The last loaded town is remembered in the browser, so reloading the page keeps it.

## Steps
1. Prepare the census grid once for all of Lower Saxony (offline), stored as one small file per town.
2. Add a live "build town data" step that produces the same shape of data Lüneburg uses today (districts, blocks, squares, amenities, future blocks).
3. Make the dashboard read from the "current town" instead of fixed Lüneburg files; Lüneburg stays the default and keeps its richer data.
4. Hide the Lüneburg-only parts (land-use plan, shop vacancy) for other towns and say why.
5. "Weiter" on the Andere Gemeinde page loads the town and opens the dashboard; header shows the current town and a button back to Lüneburg.
6. Test with Uelzen and Celle; check Lüneburg is unchanged.

## Technical details
- Census: download the three-plus nationwide 100 m CSVs once, filter to AGS 03*, assign cells to municipalities by ALKIS/OSM boundary, write `public/zensus/{ags}.json` (estimated 10–20 MB total, served statically, fetched by the server function).
- New server function `buildCity(osmId, ags)` returns `{ stadtteile, gitter, blocke, versorgung, zukunftBloecke, summary }` in the existing JSON shapes; amenity bitmask uses straight-line 600/400 m.
- `src/lib/radar.ts` and `src/lib/future.ts` currently import JSON at module load; refactor to a `CityData` context with Lüneburg as the default, and keep block tile constants per city (origin derived from the town's bounding box).
- Features gated by `city.hasFnp` / `city.hasGewerbe`.
- The Lüneburg data files and offline scripts stay untouched.
