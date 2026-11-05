"""Download and clip official Lower Saxony nature-reserve polygons to Lüneburg.

The source is the NLWKN/Lower Saxony protected-sites WFS (DL-DE BY 2.0).
Only legally designated nature reserves (NSG) are treated as hard exclusions
in the first-pass development screen; other protected categories can require
review but are not blanket exclusions.
"""

import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pyproj
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union


ROOT = Path(__file__).resolve().parents[1]
DISTRICTS = ROOT / "src/data/stadtteile.json"
OUTPUT = ROOT / "src/data/naturschutzgebiete.json"
WFS = "https://www.umweltkarten-niedersachsen.de/geoserver/SchutzgebieteNI/wfs"
TYPE = "SchutzgebieteNI:ProtectedSites_IUCN_HabitatSpeciesManagementArea_Surface"


def main():
    district_data = json.loads(DISTRICTS.read_text(encoding="utf-8"))
    city = unary_union([shape(f["geometry"]) for f in district_data["features"]])
    to_meters = pyproj.Transformer.from_crs(4326, 25832, always_xy=True).transform
    to_wgs84 = pyproj.Transformer.from_crs(25832, 4326, always_xy=True).transform
    city_m = transform(to_meters, city)
    minx, miny, maxx, maxy = city.bounds
    params = urlencode({
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": TYPE,
        "bbox": f"{minx},{miny},{maxx},{maxy},EPSG:4326",
        "outputFormat": "application/json",
    })
    request = Request(f"{WFS}?{params}", headers={"User-Agent": "HousingRadar/1.0"})
    with urlopen(request, timeout=60) as response:
        source = json.load(response)

    features = []
    for feature in source.get("features", []):
        props = feature.get("properties", {})
        if props.get("d_3_designation") != "NSG":
            continue
        geom = transform(to_meters, shape(feature["geometry"]))
        clipped = geom.intersection(city_m)
        if clipped.is_empty:
            continue
        if not clipped.is_valid:
            clipped = clipped.buffer(0)
        clipped = clipped.simplify(1.5, preserve_topology=True)
        clipped = transform(to_wgs84, clipped)
        features.append({
            "type": "Feature",
            "geometry": mapping(clipped),
            "properties": {
                "name": props.get("sitename_name_1") or "Naturschutzgebiet",
                "designation": "NSG",
                "sourceId": props.get("inspireid_localid") or str(props.get("featureid", "")),
            },
        })

    result = {"type": "FeatureCollection", "features": features}
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(features)} clipped nature-reserve polygons to {OUTPUT}")


if __name__ == "__main__":
    main()
