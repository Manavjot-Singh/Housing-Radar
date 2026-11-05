"""Commercial vacancy layer from the LeAn extract (Leerstandsmanagement, anonymised).

Usage: python scripts/prepare_gewerbe.py LeAn_Auszug_anonymisiert.xlsx

House numbers in the extract are anonymised (99, 100, ...), so objects are placed on the
street they belong to (street position from OSM Nominatim, retrieved 05.11.2026).
Owner and contact columns are dropped and never written out.
Output: src/data/gewerbe.json = list of [street, lon, lat, objects, vacant, at risk, reuse agreed].
"""
import json, re, sys
from collections import defaultdict
import pandas as pd

STREETS = {
    "Am Sande": [10.41094, 53.24765], "Grapengießerstraße": [10.40528, 53.24742],
    "Bardowicker Straße": [10.40944, 53.25279], "Am Markt": [10.40827, 53.24997],
    "Große Bäckerstraße": [10.40886, 53.24911], "Rackerstraße": [10.40657, 53.24637],
    "Am Berge": [10.41102, 53.24871], "Glockenstraße": [10.40996, 53.24837],
    "An den Brodbänken": [10.40961, 53.25035], "An der Münze": [10.40705, 53.2496],
    "Apothekenstraße": [10.40812, 53.24903], "Auf dem Wüstenort": [10.41038, 53.2492],
    "Bei der St. Lambertikirche": [10.40263, 53.24595], "Rosenstraße": [10.41085, 53.25043],
    "Schröderstraße": [10.40649, 53.24863],
}

df = pd.read_excel(sys.argv[1])[["Straße", "Objektstatus"]]
agg = defaultdict(lambda: [0, 0, 0, 0])
for _, r in df.iterrows():
    s = re.sub(r"\s+\d+\w*$", "", str(r["Straße"]).strip())  # "Apothekenstraße 7" -> street only
    a = agg[s]
    a[0] += 1
    st = r["Objektstatus"]
    if st == "Leerstand": a[1] += 1
    elif st == "drohender Leerstand": a[2] += 1
    elif st == "Nachnutzung vereinbart": a[3] += 1

out = [[s, *STREETS[s], *v] for s, v in sorted(agg.items())]
json.dump(out, open("src/data/gewerbe.json", "w"), ensure_ascii=False)
print(len(df), "objects on", len(out), "streets;", sum(v[1] for v in agg.values()), "vacant,", sum(v[2] for v in agg.values()), "at risk")
