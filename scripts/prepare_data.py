import json,csv
from shapely.geometry import LineString,Point,mapping,shape
from shapely.ops import polygonize,unary_union,transform
from shapely import prepared
import pyproj
g=json.load(open('/tmp/d/geom.json'))
to3035=pyproj.Transformer.from_crs(4326,3035,always_xy=True).transform
to4326=pyproj.Transformer.from_crs(3035,4326,always_xy=True).transform
D=[]
for e in g['elements']:
    lines=[LineString([(p['lon'],p['lat']) for p in m['geometry']]) for m in e['members'] if m['type']=='way' and m.get('role')in('outer','')]
    poly=unary_union(list(polygonize(unary_union(lines))))
    D.append(dict(id=e['id'],name=e['tags']['name'],geom=poly,g3=transform(to3035,poly)))
U=unary_union([d['g3'] for d in D]); minx,miny,maxx,maxy=U.bounds
def load(f,col):
    r={}
    with open(f,encoding='utf-8',errors='replace') as fh:
        for row in csv.DictReader(fh,delimiter=';'):
            x=float(row['x_mp_100m']);y=float(row['y_mp_100m'])
            if minx<=x<=maxx and miny<=y<=maxy:
                v=row[col].replace(',','.')
                try:v=float(v)
                except:v=None
                r[row['GITTER_ID_100m']]=(x,y,v)
    return r
bev=load('/tmp/d/bev/Zensus2022_Bevoelkerungszahl_100m-Gitter.csv','Einwohner')
wf=load('/tmp/d/wf/Zensus2022_Durchschn_Flaeche_je_Bewohner_100m-Gitter.csv','durchschnFlaechejeBew')
ls=load('/tmp/d/ls/Zensus2022_Leerstandsquote_100m-Gitter.csv','Leerstandsquote')
P=[(d,prepared.prep(d['g3'])) for d in D]
cells=[];agg={d['name']:dict(ew=0,cells=0,wfw=0,wfp=0,lsw=0,lsp=0,wfmiss=0) for d in D}
for k in set(bev)|set(wf):
    x,y,_=(bev.get(k) or wf.get(k)); pt=Point(x,y)
    dn=next((d['name'] for d,p in P if p.contains(pt)),None)
    if not dn: continue
    ew=bev.get(k,(0,0,None))[2]; w=wf.get(k,(0,0,None))[2]; l=ls.get(k,(0,0,None))[2]
    a=agg[dn];a['cells']+=1
    if ew: a['ew']+=ew
    if ew and w is not None: a['wfw']+=w*ew;a['wfp']+=ew
    elif ew: a['wfmiss']+=ew
    if ew and l is not None: a['lsw']+=l*ew;a['lsp']+=ew
    lon,lat=to4326(x,y)
    cells.append([round(lon,5),round(lat,5),ew,w,l,dn])
tot=dict(ew=sum(a['ew'] for a in agg.values()),wfw=sum(a['wfw'] for a in agg.values()),wfp=sum(a['wfp'] for a in agg.values()))
city=round(tot['wfw']/tot['wfp'],1)
feats=[]
for d in D:
    a=agg[d['name']];wfv=round(a['wfw']/a['wfp'],1) if a['wfp'] else None
    feats.append(dict(type='Feature',geometry=mapping(d['geom'].simplify(0.0001)),properties=dict(
      name=d['name'],osmId=d['id'],einwohner=int(a['ew']),zellen=a['cells'],
      wohnflaecheProKopf=wfv,leerstandsquote=round(a['lsw']/a['lsp'],1) if a['lsp'] else None,
      abweichung=round((wfv-city)/city*100,1) if wfv else None,
      abdeckung=round(a['wfp']/a['ew']*100) if a['ew'] else 0,
      flaecheKm2=round(d['g3'].area/1e6,2))))
json.dump(dict(type='FeatureCollection',features=feats),open('/tmp/d/out/stadtteile.json','w'),ensure_ascii=False)
json.dump(dict(stadtWohnflaecheProKopf=city,einwohner=int(tot['ew']),zellen=len(cells)),open('/tmp/d/out/summary.json','w'))
json.dump(cells,open('/tmp/d/out/gitter.json','w'),ensure_ascii=False,separators=(',',':'))
for f in sorted(feats,key=lambda f:-(f['properties']['wohnflaecheProKopf'] or 0)):print(f['properties'])
print(city,tot['ew'],len(cells))
