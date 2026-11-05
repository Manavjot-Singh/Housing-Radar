# Aggregates the 100 m census grid (src/data/gitter.json) into ~500 m blocks inside each
# district, so the map can show readable areas at city zoom instead of 4-pixel squares.
# Blocks never cross a district border. Writes src/data/blocke.json.
import json
from collections import defaultdict

LON0, LAT0 = 10.30, 53.10      # fixed origin so the app can derive the same tile index
DLON, DLAT = 0.0075, 0.0045    # ~500 m at Lüneburg's latitude = 5 x 5 census cells

cells = json.load(open('src/data/gitter.json'))
groups = defaultdict(list)
for c in cells:
    ix = int((c[0] - LON0) // DLON)
    iy = int((c[1] - LAT0) // DLAT)
    groups[(c[9], ix, iy)].append(c)

# per-person measures are weighted by residents; building/amenity shares by cell
def wmean(cs, i):
    num = sum(c[i] * c[2] for c in cs if c[i] is not None and c[2])
    den = sum(c[2] for c in cs if c[i] is not None and c[2])
    return round(num / den, 2) if den else None

def cmean(cs, i):
    v = [c[i] for c in cs if c[i] is not None]
    return round(sum(v) / len(v), 2) if v else None

out = []
for (dn, ix, iy), cs in groups.items():
    ew = sum(c[2] or 0 for c in cs)
    vac_res = sum(c[2] or 0 for c in cs if c[4] is not None)
    out.append([
        f"{dn}|{ix}|{iy}", ew,
        wmean(cs, 3), wmean(cs, 4), wmean(cs, 5), cmean(cs, 6), wmean(cs, 7), cmean(cs, 8),
        len(cs), round(vac_res / ew * 100) if ew else 0, dn,
    ])

out.sort(key=lambda b: (b[10], b[0]))
json.dump(out, open('src/data/blocke.json', 'w'), ensure_ascii=False, separators=(',', ':'))

print('cells', len(cells), '-> blocks', len(out))
print('residents cells', sum(c[2] or 0 for c in cells), '| blocks', sum(b[1] for b in out))
print('blocks per district', {d: sum(1 for b in out if b[10] == d) for d in sorted({b[10] for b in out})})
print('blocks with own vacancy value', sum(1 for b in out if b[3] is not None), 'of', len(out))
print('residents in blocks with own vacancy value', sum(b[1] for b in out if b[3] is not None))
print('largest block residents', max(b[1] for b in out), '| median', sorted(b[1] for b in out)[len(out)//2])
print('example', out[0])
