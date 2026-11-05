# Adds the analysis layers (age 65+, building type, rooms per person, amenities) to the grid
# and district data. Inputs: Zensus 2022 100m CSVs (destatis.de/static/DE/zensus/gitterdaten/*.zip)
# and an OSM Overpass extract (supermarkets, doctors, bus/rail stops) in /tmp/d/osm.json.
import json,csv,glob,math
from shapely.geometry import shape,Point
from shapely.ops import transform
from shapely import prepared
from scipy.spatial import cKDTree
import pyproj
to3035=pyproj.Transformer.from_crs(4326,3035,always_xy=True).transform
to4326=pyproj.Transformer.from_crs(3035,4326,always_xy=True).transform
st=json.load(open('src/data/stadtteile.json'))
D=[(f['properties']['name'],prepared.prep(transform(to3035,shape(f['geometry'])))) for f in st['features']]
U=[transform(to3035,shape(f['geometry'])).bounds for f in st['features']]
minx=min(b[0] for b in U);miny=min(b[1] for b in U);maxx=max(b[2] for b in U);maxy=max(b[3] for b in U)
def num(v):
    try:return float(v.replace(',','.'))
    except:return None
def load(pat):
    r={}
    with open(glob.glob('/tmp/d/'+pat,recursive=True)[0],encoding='latin1') as fh:
        for row in csv.DictReader(fh,delimiter=';'):
            x=float(row['x_mp_100m']);y=float(row['y_mp_100m'])
            if minx<=x<=maxx and miny<=y<=maxy: r[(x,y)]=row
    return r
bev=load('**/Zensus2022_Bevoelkerungszahl_100m-Gitter.csv')
wf=load('**/*Flaeche_je_Bewohner_100m-Gitter.csv')
ls=load('**/*Leerstandsquote_100m-Gitter.csv')
a65=load('**/*Anteil_ueber_65_100m-Gitter.csv')
geb=load('**/*Gebaeude_nach_Anzahl_der_Wohnungen_100m-Gitter.csv')
rm=load('**/*Zahl_der_Raeume_100m-Gitter.csv')
# amenities
osm=json.load(open('/tmp/d/osm.json'))['elements']
cat={'shop':[],'doc':[],'pt':[]}
for e in osm:
    t=e.get('tags',{});lon=e.get('lon') or e.get('center',{}).get('lon');lat=e.get('lat') or e.get('center',{}).get('lat')
    if lon is None:continue
    p=to3035(lon,lat)
    if t.get('shop') in('supermarket','convenience'):cat['shop'].append(p)
    elif t.get('amenity') in('doctors','clinic') or t.get('healthcare')=='doctor':cat['doc'].append(p)
    elif t.get('highway')=='bus_stop' or t.get('railway') in('station','halt'):cat['pt'].append(p)
print({k:len(v) for k,v in cat.items()})
trees={k:cKDTree(v) for k,v in cat.items()}
R={'shop':600,'doc':600,'pt':400}
cells=[];agg={}
for (x,y) in set(bev)|set(wf)|set(geb):
    pt=Point(x,y);dn=next((n for n,p in D if p.contains(pt)),None)
    if not dn:continue
    ew=num(bev.get((x,y),{}).get('Einwohner','')) or 0
    w=num(wf.get((x,y),{}).get('durchschnFlaechejeBew',''))
    l=num(ls.get((x,y),{}).get('Leerstandsquote',''))
    o=num(a65.get((x,y),{}).get('AnteilUeber65',''))
    g=geb.get((x,y));efh=None;gt=gk=0
    if g:
        tot=num(g['Insgesamt_Gebaeude']);parts=[num(g[k]) for k in('1_Wohnung','2_Wohnungen','3bis6_Wohnungen','7bis12_Wohnungen','13undmehr_Wohnungen')]
        tot=sum(v or 0 for v in parts)  # '–' = 0; parts are rounded/perturbed, so use their sum
        if tot:
            s=(parts[0] or 0)+(parts[1] or 0);efh=round(s/tot*100);gt=tot;gk=s
    r=rm.get((x,y));rooms=None
    if r and ew>0:
        ks=['1Raum','2Raeume','3Raeume','4Raeume','5Raeume','6Raeume','7undmehrRaeume'];vals=[num(r[k]) for k in ks];tot=num(r['Insgesamt_Wohnungen'])
        tot=sum(v or 0 for v in vals)
        if tot:
            rooms=sum((i+1)*(v or 0) for i,v in enumerate(vals))/ew
            if rooms>6:rooms=None
    dist={k:trees[k].query([x,y])[0] for k in trees}
    am=sum(1 for k in R if dist[k]<=R[k])
    lon,lat=to4326(x,y)
    cells.append([round(lon,5),round(lat,5),int(ew) if ew else None,w,l,o,efh,round(rooms,2) if rooms else None,am,dn])
    a=agg.setdefault(dn,dict(ew=0,o=[0,0],r=[0,0],gt=0,gk=0,am=[0,0]))
    if ew:
        a['ew']+=ew;a['am'][0]+=am*ew;a['am'][1]+=ew
        if o is not None:a['o'][0]+=o*ew;a['o'][1]+=ew
        if rooms is not None:a['r'][0]+=rooms*ew;a['r'][1]+=ew
    a['gt']+=gt;a['gk']+=gk
for f in st['features']:
    p=f['properties'];a=agg.get(p['name'])
    p['anteil65']=round(a['o'][0]/a['o'][1],1) if a and a['o'][1] else None
    p['abdeckung65']=round(a['o'][1]/a['ew']*100) if a and a['ew'] else 0
    p['raeumeProKopf']=round(a['r'][0]/a['r'][1],2) if a and a['r'][1] else None
    p['abdeckungRaeume']=round(a['r'][1]/a['ew']*100) if a and a['ew'] else 0
    p['efhAnteil']=round(a['gk']/a['gt']*100,1) if a and a['gt'] else None
    p['versorgung']=round(a['am'][0]/a['am'][1],2) if a and a['am'][1] else None
    print(p['name'],p['anteil65'],p['abdeckung65'],p['raeumeProKopf'],p['abdeckungRaeume'],p['efhAnteil'],p['versorgung'])
json.dump(st,open('src/data/stadtteile.json','w'),ensure_ascii=False)
json.dump(cells,open('src/data/gitter.json','w'),ensure_ascii=False,separators=(',',':'))
json.dump({k:[[round(c,5) for c in to4326(*p)] for p in v] for k,v in cat.items()},open('src/data/versorgung.json','w'),separators=(',',':'))
n=len(cells);print(n,{i:sum(1 for c in cells if c[i] is not None)/n for i in range(3,9)})
