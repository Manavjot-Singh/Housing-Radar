"""Create district-level review zones, subtracting official NSG exclusions.

This is a screening layer, not a parcel/buildability determination. It selects
districts with high housing pressure and low building coverage, then subtracts
the current NSG polygons from their district geometries.
"""
import json
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
districts = json.loads((ROOT / "src/data/stadtteile.json").read_text(encoding="utf-8"))
reserves = json.loads((ROOT / "src/data/naturschutzgebiete.json").read_text(encoding="utf-8"))
excluded = unary_union([shape(f["geometry"]) for f in reserves["features"]])
out = []
for feature in districts["features"]:
    p = feature["properties"]
    pressure = p.get("wohnflaecheProKopf") is not None and p["wohnflaecheProKopf"] < 50 and p.get("leerstandsquote") is not None and p["leerstandsquote"] <= 11
    low_coverage = p.get("bebautAnteil", 100) <= 10
    if not (pressure and low_coverage):
        continue
    area = shape(feature["geometry"]).difference(excluded)
    if area.is_empty:
        continue
    out.append({"type": "Feature", "geometry": mapping(area.simplify(0.00002, preserve_topology=True)), "properties": {
        "name": p["name"], "livingSpacePerResident": p["wohnflaecheProKopf"],
        "vacancyRate": p["leerstandsquote"], "buildingCoverage": p["bebautAnteil"],
    }})
path = ROOT / "src/data/future-development-areas.json"
path.write_text(json.dumps({"type": "FeatureCollection", "features": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Wrote {len(out)} district review zones after subtracting nature reserves")
