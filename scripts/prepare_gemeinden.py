# Zensus 2022 Regionaltabellen (Destatis, dl-de/by-2-0) -> src/data/gemeinden.json
# Downloads: https://www.destatis.de/static/DE/zensus/gitterdaten/Regionaltabelle_{Bevoelkerung,Gebaeude_Wohnungen,Demografie}.xlsx
# One row per municipality: [AGS, name, residents, vacancy %, m2 per flat, flats, % flats in 1-2 family houses, % aged 67+, ~m2 per resident]
import json, openpyxl
D = '/tmp/z/Regionaltabelle_'
def sheet(f, s):
    ws = openpyxl.load_workbook(D + f + '.xlsx', read_only=True)[s]
    it = ws.iter_rows(values_only=True); h = next(it)
    return {r[1]: dict(zip(h, r)) for r in it if r[3] in ('Gemeinde', 'Bund')}
def num(v):
    try: return float(str(v).replace(',', '.'))
    except: return None
bev = sheet('Bevoelkerung', 'CSV-Einwohnerzahl')
wo = sheet('Gebaeude_Wohnungen', 'CSV-Wohnungen')
dem = sheet('Demografie', 'CSV-Demografie')
out = []
for rs, b in bev.items():
    w = wo.get(rs, {}); d = dem.get(rs, {})
    ew = num(b['EWZ']); fl = num(w.get('FLAECHE')); tot = num(w.get('GEBAEUDEART_SYS_1'))
    occ = (num(w.get('NUTZUNG__01')) or 0) + (num(w.get('NUTZUNG__02')) or 0)
    efh = (num(w.get('ZAHLWOHNGN_HHG__1')) or 0) + (num(w.get('ZAHLWOHNGN_HHG__2')) or 0)
    alt = (num(d.get('Alter_infr__10')) or 0) + (num(d.get('Alter_infr__11')) or 0)
    dtot = num(d.get('0_Insgesamt_'))
    r1 = lambda x: round(x, 1) if x is not None else None
    out.append([rs, b['Name'], int(ew) if ew else None, r1(num(w.get('LEQ'))), r1(fl), int(tot) if tot else None,
                r1(efh / tot * 100) if tot else None, r1(alt / dtot * 100) if dtot else None,
                r1(fl * occ / ew) if fl and ew and occ else None])
json.dump(out, open('src/data/gemeinden.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out), [r for r in out if r[1].startswith('Lüneburg') or r[0] == '00'])
