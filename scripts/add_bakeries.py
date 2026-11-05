# Adds bakeries (OSM shop=bakery/pastry, Overpass extract in /tmp/d/bak.json) as a 4th amenity
# and recomputes the amenity reach bitmask per grid cell and per district from the points already
# stored in src/data/versorgung.json. Run scripts/prepare_blocks.py afterwards.
import json
import pyproj
from scipy.spatial import cKDTree
to3035 = pyproj.Transformer.from_crs(4326, 3035, always_xy=True).transform

pts = json.load(open('src/data/versorgung.json'))
bak = []
for e in json.load(open('/tmp/d/bak.json'))['elements']:
    lon = e.get('lon') or e.get('center', {}).get('lon'); lat = e.get('lat') or e.get('center', {}).get('lat')
    if lon is not None: bak.append([round(lon, 5), round(lat, 5)])
pts['bakery'] = bak
R = {'shop': 600, 'doc': 600, 'pt': 400, 'bakery': 600}
BIT = {'shop': 1, 'doc': 2, 'pt': 4, 'bakery': 8}
trees = {k: cKDTree([to3035(*p) for p in pts[k]]) for k in R}

cells = json.load(open('src/data/gitter.json'))
agg = {}
for c in cells:
    xy = to3035(c[0], c[1])
    # c[8] = bitmask of amenities in reach (shop 1, doc 2, pt 4, bakery 8); the app scores it
    # against whichever amenities the user selected.
    c[8] = sum(BIT[k] for k in R if trees[k].query(xy)[0] <= R[k])
    if c[2]:
        a = agg.setdefault(c[9], [0, 0]); a[0] += bin(c[8]).count('1') * c[2]; a[1] += c[2]

st = json.load(open('src/data/stadtteile.json'))
for f in st['features']:
    a = agg.get(f['properties']['name'])
    f['properties']['versorgung'] = round(a[0] / a[1], 2) if a and a[1] else None
    print(f['properties']['name'], f['properties']['versorgung'])
print({k: len(v) for k, v in pts.items()})
json.dump(st, open('src/data/stadtteile.json', 'w'), ensure_ascii=False)
json.dump(cells, open('src/data/gitter.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(pts, open('src/data/versorgung.json', 'w'), separators=(',', ':'))
