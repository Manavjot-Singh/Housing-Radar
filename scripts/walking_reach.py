# Replaces straight-line amenity reach with walking distance over the OSM street/footpath network.
# Input: Overpass extract of walkable ways (no motorways/trunk roads, no foot=no/private) in
# /tmp/d/walk.json, plus the amenity points in src/data/versorgung.json.
# Distance = snap from cell centre to nearest path node + shortest path + snap to the amenity.
# Rewrites the reach bitmask c[8] in gitter.json and district 'versorgung'. Run prepare_blocks.py after.
import json
import numpy as np
import pyproj
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

to3035 = pyproj.Transformer.from_crs(4326, 3035, always_xy=True).transform
el = json.load(open('/tmp/d/walk.json'))['elements']
ids, xy = [], []
for e in el:
    if e['type'] == 'node':
        ids.append(e['id']); xy.append(to3035(e['lon'], e['lat']))
idx = {i: k for k, i in enumerate(ids)}
xy = np.array(xy)
a, b = [], []
for e in el:
    if e['type'] == 'way':
        n = [idx[i] for i in e['nodes'] if i in idx]
        a += n[:-1]; b += n[1:]
a, b = np.array(a), np.array(b)
w = np.hypot(*(xy[a] - xy[b]).T)
N = len(xy)
tree = cKDTree(xy)

R = {'shop': 600, 'doc': 600, 'pt': 400, 'bakery': 600}
BIT = {'shop': 1, 'doc': 2, 'pt': 4, 'bakery': 8}
pts = json.load(open('src/data/versorgung.json'))
cells = json.load(open('src/data/gitter.json'))
cxy = np.array([to3035(c[0], c[1]) for c in cells])
csnap, cnode = tree.query(cxy)

reach = {}
for k in R:
    p = np.array([to3035(*q) for q in pts[k]])
    s, nd = tree.query(p)
    # virtual source N connected to each amenity's nearest path node with its snap distance
    rows = np.concatenate([a, b, np.full(len(nd), N)]); cols = np.concatenate([b, a, nd])
    G = coo_matrix((np.concatenate([w, w, s + 0.01]), (rows, cols)), shape=(N + 1, N + 1)).tocsr()
    d = dijkstra(G, directed=True, indices=N, limit=R[k] + 200)
    reach[k] = d[cnode] + csnap <= R[k]

agg = {}
before = sum(bin(c[8]).count('1') for c in cells)
for i, c in enumerate(cells):
    c[8] = sum(BIT[k] for k in R if reach[k][i])
    if c[2]:
        g = agg.setdefault(c[9], [0, 0]); g[0] += bin(c[8]).count('1') * c[2]; g[1] += c[2]
print('reach hits straight-line', before, '-> walking', sum(bin(c[8]).count('1') for c in cells))
st = json.load(open('src/data/stadtteile.json'))
for f in st['features']:
    g = agg.get(f['properties']['name'])
    f['properties']['versorgung'] = round(g[0] / g[1], 2) if g and g[1] else None
    print(f['properties']['name'], f['properties']['versorgung'])
json.dump(st, open('src/data/stadtteile.json', 'w'), ensure_ascii=False)
json.dump(cells, open('src/data/gitter.json', 'w'), ensure_ascii=False, separators=(',', ':'))
