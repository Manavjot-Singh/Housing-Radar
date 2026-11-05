# Splits the nationwide Zensus 2022 100 m grid into small tiles for Lower Saxony, so the
# "other municipality" dashboard can load the census cells of any town on demand.
# Input: the six 100 m CSVs (destatis.de/static/DE/zensus/gitterdaten/*.zip) unpacked under /tmp/z.
# Output: public/zensus/{ix}_{iy}.json with ix = floor(lon / 0.15), iy = floor(lat / 0.1);
# each cell is [lon, lat, residents, living m²/person, vacancy %, 65+ %, 1–2-dwelling %, rooms/person]
# (same order as the first eight fields of src/data/gitter.json). Keep TILE_* in sync with src/lib/city.ts.
import csv, glob, json, math, os
from collections import defaultdict
import pyproj

TILE_DLON, TILE_DLAT = 0.15, 0.1
W, S, E, N = 6.6, 51.25, 11.65, 53.95  # Lower Saxony incl. Bremen
to3035 = pyproj.Transformer.from_crs(4326, 3035, always_xy=True).transform
to4326 = pyproj.Transformer.from_crs(3035, 4326, always_xy=True).transform
xs, ys = zip(*[to3035(x, y) for x in (W, E) for y in (S, N)])
X0, X1, Y0, Y1 = min(xs) - 1000, max(xs) + 1000, min(ys) - 1000, max(ys) + 1000

def num(v):
    try: return float(v.replace(',', '.'))
    except: return None

def load(pat):
    r = {}
    with open(glob.glob('/tmp/z/**/' + pat, recursive=True)[0], encoding='latin1') as fh:
        for row in csv.DictReader(fh, delimiter=';'):
            x = float(row['x_mp_100m']); y = float(row['y_mp_100m'])
            if X0 <= x <= X1 and Y0 <= y <= Y1: r[(x, y)] = row
    print(pat, len(r))
    return r

bev = load('*Bevoelkerungszahl_100m-Gitter.csv')
wf = load('*Flaeche_je_Bewohner_100m-Gitter.csv')
ls = load('*Leerstandsquote_100m-Gitter.csv')
a65 = load('*Anteil_ueber_65_100m-Gitter.csv')
geb = load('*Gebaeude_nach_Anzahl_der_Wohnungen_100m-Gitter.csv')
rm = load('*Zahl_der_Raeume_100m-Gitter.csv')

tiles = defaultdict(list)
for (x, y) in set(bev) | set(wf) | set(geb):
    lon, lat = to4326(x, y)
    if not (W <= lon <= E and S <= lat <= N): continue
    ew = num(bev.get((x, y), {}).get('Einwohner', '')) or 0
    w = num(wf.get((x, y), {}).get('durchschnFlaechejeBew', ''))
    l = num(ls.get((x, y), {}).get('Leerstandsquote', ''))
    o = num(a65.get((x, y), {}).get('AnteilUeber65', ''))
    efh = None
    g = geb.get((x, y))
    if g:
        parts = [num(g[k]) or 0 for k in ('1_Wohnung', '2_Wohnungen', '3bis6_Wohnungen', '7bis12_Wohnungen', '13undmehr_Wohnungen')]
        tot = sum(parts)
        if tot: efh = round((parts[0] + parts[1]) / tot * 100)
    rooms = None
    r = rm.get((x, y))
    if r and ew > 0:
        vals = [num(r[k]) or 0 for k in ('1Raum', '2Raeume', '3Raeume', '4Raeume', '5Raeume', '6Raeume', '7undmehrRaeume')]
        if sum(vals):
            rooms = sum((i + 1) * v for i, v in enumerate(vals)) / ew
            if rooms > 6: rooms = None
    key = f"{math.floor(lon / TILE_DLON)}_{math.floor(lat / TILE_DLAT)}"
    tiles[key].append([round(lon, 5), round(lat, 5), int(ew) if ew else None, w, l, o, efh, round(rooms, 2) if rooms else None])

os.makedirs('public/zensus', exist_ok=True)
for k, v in tiles.items():
    json.dump(v, open(f'public/zensus/{k}.json', 'w'), separators=(',', ':'))
print('tiles', len(tiles), 'cells', sum(len(v) for v in tiles.values()))
