# Building the Housing Radar for another municipality

`build_municipality.py` finds the datasets online, cuts them to one municipality, converts them
to the exact format the app reads, and checks the result.

```bash
pip install numpy pandas scipy shapely pyproj geopandas pyogrio openpyxl
python scripts/build_municipality.py --name "Celle"
```

The files land in `data/municipalities/<slug>/`. Add `--install` to copy them into `src/data/`,
which switches the whole dashboard to that city. The first install keeps Lüneburg's data in
`data/municipalities/_original/`.

## Approve and proceed

```bash
python scripts/dataset_wizard.py
```

Open http://127.0.0.1:8770 while the dashboard's dev server runs.

1. Enter a municipality. The tool lists every dataset as Found, Fallback or Not found, and what
   disappears from the dashboard without it.
2. Untick what you do not want, or upload your own file for a row.
3. Press **Proceed**. It builds the city, installs it and checks the structure against Lüneburg.
   If that check fails, the previous city is put back and the reason is shown.

Built cities stay listed for switching back in one click, including the original Lüneburg.
The tool runs scripts on your machine, so it only listens on 127.0.0.1 and needs a per-run token.
It is not part of the deployed app.

## What is left out when a dataset is missing

The census is the one dataset the dashboard cannot work without. Without any other dataset the
analyses, custom layers, map with legends, district metrics, recommendations, future development
plans, outward growth suggestions and the Sources page all stay.

| Missing dataset | What disappears |
|---|---|
| Amenities | Amenities layer, its analysis, the amenity points and metric |
| Buildings | Density and residents-per-building layers and metrics, coverage slider |
| Land use | Forest, cemetery, allotment, car park and park exclusions (areas are overstated, and the page says so) |
| Nature, flood | That exclusion (areas are overstated, and the page says so) |
| Land-use plan | Planned-land filter, legend entry and map overlay |
| Commercial vacancy | Commercial layer and its analysis |

## Structure check

```bash
npx vitest run src/test/city-contract.test.ts
```

This holds the installed city to Lüneburg's structure: file layouts, legends, analyses, district
panel, recommendations, future development, outward growth and the Sources page.

Use `--ags` (8-digit municipality key) when a name is ambiguous, e.g. `--ags 03351006`.
A first run downloads about 120 MB of census data. Later runs reuse `~/.cache/housing-radar/`.
Overpass is often busy, so a run can wait several minutes. It retries by itself.

## Where each layer comes from

The script tries each source in order and records what it really used in `manifest.json` and on
the app's Sources page. A weaker source is never presented as an official one.

| Layer | First choice | Fallback | If nothing is found | Your own file |
|---|---|---|---|---|
| Census grid | Zensus 2022 (all Germany) | none needed | build stops | none |
| Amenities, walking network, land use | OpenStreetMap | none needed | build stops | none |
| Districts | OSM boundaries covering at least 70 % | approximate areas around named places | whole municipality as one district | `--districts-file` + `--district-name-field` |
| Buildings per district | ALKIS (Niedersachsen, automatic) | OSM buildings | none | `--buildings-file` + `--buildings-function-field` |
| Nature + landscape protection | NLWKN (Niedersachsen) | BfN national service, then OSM | layer empty, areas overstated | `--nsg-file` |
| Flood areas | NLWKN legal zones (Niedersachsen) | BfG HQ100 hazard areas | layer empty, areas overstated | `--flood-file` |
| Land-use plan (FNP) | PlanDigital WFS | none | "planned land" stays empty | `--fnp-file` |
| Commercial vacancy | none, always local | none | layer and its analysis are hidden | `--commercial-file` |

Your own files can be GeoJSON, Shapefile, GeoPackage or a zip of those.
`--commercial-file` is a table with the columns `Straße` and `Objektstatus`, using the status values
`Leerstand`, `drohender Leerstand` and `Nachnutzung vereinbart`. Other columns are never read.

## What differs from Lüneburg

- **Colour classes** are computed from each city's own quintiles, so maps stay readable. They cannot
  be compared between cities.
- **Future-development slider defaults** keep Lüneburg's position in each city's own values
  (living space at the 23rd percentile of blocks, vacancy at the 44th, coverage 10 %). The calculation
  itself is unchanged. They are planning choices, so review them for each city.
- **Flood areas outside Niedersachsen** are hazard areas reported to the EU, and only inside designated
  risk areas. A small stream outside those areas shows no flood risk. For a real planning decision
  use the state's legal zones with `--flood-file`.
- **The partner text** in the "Wohnen für Hilfe" idea (Leuphana in Lüneburg) is empty for other cities.
  Set `partnerDe` and `partnerEn` in `stadt.json` to name a local university.

## Licences

Credit the sources shown on the Sources page. OpenStreetMap-derived data is under ODbL. If a city gave
you a file under private terms, such as hackathon boundaries or vacancy lists, check those terms before
running `--install` on an app that is publicly deployed, because `src/data/` ships to every visitor.
