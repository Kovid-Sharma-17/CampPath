"""Build the OSM-only Camp Path network. No screenshot geometry or inferred links.
Usage: python3 scripts/build_camp_path.py [--refresh]
The OSC is authoritative and reconciled with already-published OSM IDs.
"""
from pathlib import Path
import collections, datetime, json, math, sys, urllib.request, xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'dist/data'
SOURCE=ROOT/'source-data/campus.osm'
URL='https://api.openstreetmap.org/api/0.6/map?bbox=-80.4385,37.2155,-80.4105,37.2365'
if '--refresh' in sys.argv:
    req=urllib.request.Request(URL,headers={'User-Agent':'CampPathLocalDemo/1.0'})
    with urllib.request.urlopen(req,timeout=90) as r: SOURCE.write_bytes(r.read())
def tags(e):return {t.get('k'):t.get('v') for t in e.findall('tag')}
def distance(a,b):
    x=(a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2));y=a[1]-b[1]
    return math.hypot(x,y)*111195

def inside(p,ring):
    result=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>p[1]) != (b[1]>p[1]) and p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:result=not result
    return result

def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def intersects(a,b,c,d):
    # Proper or boundary intersections count as construction obstruction.
    if max(a[0],b[0])+1e-12<min(c[0],d[0]) or max(c[0],d[0])+1e-12<min(a[0],b[0]) or max(a[1],b[1])+1e-12<min(c[1],d[1]) or max(c[1],d[1])+1e-12<min(a[1],b[1]):return False
    return cross(a,b,c)*cross(a,b,d)<=0 and cross(c,d,a)*cross(c,d,b)<=0

def blocked(a,b,rings):return any(inside(a,r) or inside(b,r) or any(intersects(a,b,c,d) for c,d in zip(r,r[1:]+r[:1])) for r in rings)
def feature(geometry,properties):return {'type':'Feature','geometry':geometry,'properties':properties}
def point(p,properties):return feature({'type':'Point','coordinates':p},properties)
def fc(fs):return {'type':'FeatureCollection','features':fs}
def write(name,d): (DATA/name).write_text(json.dumps(d,separators=(',',':'))+'\n')
root=ET.parse(SOURCE).getroot()
nodes={int(n.get('id')):{'p':[float(n.get('lon')),float(n.get('lat'))],'tags':tags(n)} for n in root.findall('node')}
ways={int(w.get('id')):{'refs':[int(n.get('ref')) for n in w.findall('nd')],'tags':tags(w)} for w in root.findall('way')}
relations=root.findall('relation')
osc=ET.parse(ROOT/'source-data/campus-corrections.osc').getroot()
node_map={};way_map={};overlay=set()
# Match coordinates before applying negative IDs, avoiding duplicate published edits.
coordinate_index=collections.defaultdict(list)
for nid,n in nodes.items():coordinate_index[(round(n['p'][0],6),round(n['p'][1],6))].append(nid)
for n in osc.findall('./create/node'):
    old=int(n.get('id'));p=[float(n.get('lon')),float(n.get('lat'))]
    candidates=coordinate_index[(round(p[0],6),round(p[1],6))]
    match=next((nid for nid in candidates if distance(nodes[nid]['p'],p)<.05),None)
    if match is None:
        nearest=min(nodes,key=lambda nid:distance(nodes[nid]['p'],p))
        match=nearest if distance(nodes[nearest]['p'],p)<.05 else old
    node_map[old]=match
    nodes[match]={'p':nodes[match]['p'] if match in nodes else p,'tags':{**nodes.get(match,{}).get('tags',{}),**tags(n)}}
for n in osc.findall('./modify/node'):
    nid=int(n.get('id'));nodes[nid]={'p':[float(n.get('lon')),float(n.get('lat'))],'tags':tags(n)}
for w in osc.findall('./create/way'):
    old=int(w.get('id'));refs=[node_map.get(int(n.get('ref')),int(n.get('ref'))) for n in w.findall('nd')];t=tags(w)
    candidates=[wid for wid,v in ways.items() if v['refs']==refs and v['tags'].get('highway')==t.get('highway') and v['tags'].get('landuse')==t.get('landuse')]
    match=max(candidates) if candidates else old
    way_map[old]=match;ways[match]={'refs':refs,'tags':t};overlay.add(match)
for w in osc.findall('./modify/way'):
    wid=int(w.get('id'));ways[wid]={'refs':[node_map.get(int(n.get('ref')),int(n.get('ref'))) for n in w.findall('nd')],'tags':tags(w)}
for w in osc.findall('./delete/way'):ways.pop(int(w.get('id')),None)
for n in osc.findall('./delete/node'):nodes.pop(int(n.get('id')),None)
missing={r for w in ways.values() for r in w['refs'] if r not in nodes}
if missing: raise ValueError(f'Missing {len(missing)} OSM nodes. Refresh the complete campus snapshot.')
closed_ways=[(way_map[k],ways[way_map[k]]) for k in [-7,-8,-11]]
rings=[[nodes[n]['p'] for n in w['refs']] for _,w in closed_ways]
closures=[feature({'type':'Polygon','coordinates':[r]}, {'id':str(wid),'name':'Construction area','source':'OSM + supplied OSC','closed':True}) for (wid,_),r in zip(closed_ways,rings)]
walkable={'footway','path','pedestrian','steps','living_street','service','residential','unclassified','track','corridor','elevator'}
route_names={way_map[-1]:'Derring Hall passage',way_map[-3]:'Hahn Hall North passage',way_map[-4]:'Torgersen Bridge',way_map[-5]:'Newman Library elevator connection',way_map[-6]:'Newman Library elevator connection'}
segments={};excluded=collections.Counter()
for wid,w in sorted(ways.items(),key=lambda kv:kv[0] in overlay):
    t=w['tags'];h=t.get('highway')
    if h not in walkable or t.get('area')=='yes':continue
    if t.get('foot') in ['no','private'] or (t.get('access') in ['private','no','customers'] and t.get('foot') not in ['yes','designated','permissive']):
        excluded['restricted_ways']+=1;continue
    for i,(a,b) in enumerate(zip(w['refs'],w['refs'][1:])):
        if a==b:continue
        pa,pb=nodes[a]['p'],nodes[b]['p'];closed=blocked(pa,pb,rings)
        # Barriers explicitly forbidding pedestrians are excluded at both ends.
        no_access=any(nodes[n]['tags'].get('foot') in ['no','private'] or (nodes[n]['tags'].get('access') in ['private','no'] and nodes[n]['tags'].get('foot') not in ['yes','permissive','designated']) for n in [a,b])
        if no_access:excluded['restricted_segments']+=1;continue
        key=(min(a,b),max(a,b),t.get('layer','0'),t.get('level',''))
        props={'segment_id':f'OSM-{wid}-{i}','from_node':f'N-OSM-{a}','to_node':f'N-OSM-{b}','source_way_id':wid,'highway':h,'name':route_names.get(wid,t.get('name')),'is_indoor':t.get('indoor')=='yes' or t.get('tunnel')=='building_passage' or wid in route_names,'layer':t.get('layer','0'),'surface':t.get('surface','unknown'),'steps':h=='steps','oneway':t.get('oneway:foot','no'),'closed':closed,'overlay':wid in overlay,'source':'OpenStreetMap','tags':{k:t[k] for k in ['bridge','tunnel','level','opening_hours','incline','access','foot'] if k in t}}
        if key in segments:
            old=segments[key]['properties'];props['steps']=props['steps'] or old['steps'];props['closed']=closed or old['closed']
            props['source_way_ids']=list(dict.fromkeys(old.get('source_way_ids',[old['source_way_id']])+[wid]))
        segments[key]=feature({'type':'LineString','coordinates':[pa,pb]},props)
paths=list(segments.values())
adj=collections.defaultdict(set);all_routable=set()
for f in paths:
    p=f['properties'];a=int(p['from_node'][6:]);b=int(p['to_node'][6:]);all_routable.update([a,b])
    if not p['closed'] and not p['steps']:adj[a].add(b);adj[b].add(a)
components=[];seen=set()
for n in adj:
    if n in seen:continue
    stack=[n];comp=set()
    while stack:
        q=stack.pop()
        if q in seen:continue
        seen.add(q);comp.add(q);stack.extend(adj[q]-seen)
    components.append(comp)
main=max(components,key=len)
# Building geometry comes from OSM ways and outer relation members.
footprints=[]
for wid,w in ways.items():
    if w['tags'].get('building') not in [None,'no'] or w['tags'].get('building:part') not in [None,'no']:
        refs=w['refs'];footprints.append({'id':f'way/{wid}','refs':refs,'ring':[nodes[n]['p'] for n in refs],'tags':w['tags']})
for rel in relations:
    t=tags(rel)
    if t.get('building') in [None,'no'] and t.get('building:part') in [None,'no']:continue
    refs=[]
    for m in rel.findall('member'):
        if m.get('type')=='way' and m.get('role') in ['outer',''] and int(m.get('ref')) in ways:refs+=ways[int(m.get('ref'))]['refs']
    if refs:footprints.append({'id':f'relation/{rel.get("id")}','refs':refs,'ring':[nodes[n]['p'] for n in refs],'tags':t})
# The catalog supplies the user's destination names; old coordinates are lookup seeds only.
catalog=ROOT/'source-data/camp-path-places.json'
if not catalog.exists():catalog.write_text(json.dumps(json.loads((DATA/'buildings.geojson').read_text())['features'],indent=2)+'\n')
old_buildings=json.loads(catalog.read_text());buildings=[];entrances=[];coverage=[]
aliases={'VT-GOODWIN':['Goodwin'],'VT-DDS':['DDS','D&DS','Data and Decision Sciences'],'VT-NEWMAN-LIB':['Newman Library','Library','Carol Newman Library'],'VT-PAMPLIN':['Pamplin','Hamlin Hall'],'VT-NCB':['NCB','New Classroom Building'],'VT-DAVIDSON':['Davidson'],'VT-HITT':['Hitt','Perry Place'],'VT-LAVERY-HALL':['Lavery','Turner','Turner Place'],'VT-TORGERSEN':['Torgersen','Torgersen Bridge'],'VT-DERRING':['Derring','Daring Hall'],'VT-HANCOCK':['Hancock Hall']}
for old in old_buildings:
    p=old['properties'];bid=p['building_id'];seed=old['geometry']['coordinates']
    if 'Hancock' in p['name']:aliases[bid]=['Hancock Hall','Hancock']
    if p['name'].startswith('Military Building'):aliases[bid]=['Military Building']
    candidates=sorted(footprints,key=lambda f:0 if inside(seed,f['ring']) else min(distance(seed,n) for n in f['ring']))
    footprint=candidates[0] if candidates and (inside(seed,candidates[0]['ring']) or min(distance(seed,n) for n in candidates[0]['ring'])<65) else None
    if footprint:
        # Retain wing-specific position by selecting the closest OSM footprint vertex for separate wings.
        ring=footprint['ring'];coords=[sum(q[i] for q in ring)/len(ring) for i in [0,1]]
        mapped=[n for n in set(footprint['refs']) if n in all_routable and nodes[n]['tags'].get('entrance') not in [None,'no','emergency','exit']]
        mapped=sorted(mapped,key=lambda n:distance(seed,nodes[n]['p']))[:12]
        source=footprint['id']
    else:
        closest=min(main,key=lambda n:distance(seed,nodes[n]['p']));coords=nodes[closest]['p'];mapped=[];source=f'node/{closest}'
    entry_ids=mapped
    fallback=None
    if not entry_ids or not any(n in main for n in entry_ids):
        # A nearby OSM node is an arrival point, never draw a fabricated connector into the building.
        closest=min(main,key=lambda n:distance(seed,nodes[n]['p']));entry_ids=[*entry_ids,closest] if entry_ids else [closest];fallback=closest
    bprops={'building_id':bid,'name':p['name'],'aliases':list(dict.fromkeys(aliases.get(bid,[])+([p.get('abbreviation')] if p.get('abbreviation') else []))),'osm_source':source,'arrival_kind':'entrance' if mapped and fallback is None else 'nearby_path','under_construction':'under construction' in p['name'].lower()}
    buildings.append(point(coords,bprops))
    for n in entry_ids:
        t=nodes[n]['tags'];entrances.append(point(nodes[n]['p'],{'entrance_id':f'{bid}-{n}','building_id':bid,'node_id':f'N-OSM-{n}','entrance_name':('Main entrance' if t.get('entrance')=='main' else 'Mapped entrance') if mapped and n != fallback else 'Nearby mapped path','kind':'entrance' if mapped and n != fallback else 'nearby_path','osm_node_id':n,'gap_m':round(distance(seed,nodes[n]['p'])),'tags':t}))
    coverage.append({'id':bid,'name':p['name'],'arrival_kind':bprops['arrival_kind'],'entrances':entry_ids,'connected_without_stairs':any(n in main for n in entry_ids)})
# Named dining destinations are aliases of their building, not invented indoor nodes.
pois=[]
for pid,bid,name,alt in [('POI-PERRY-PLACE','VT-HITT','Perry Place',['Perry','Perry Place Dining']),('POI-TURNER-PLACE','VT-LAVERY-HALL','Turner Place',['Turner','Turner at Lavery'])]:
    b=next(b for b in buildings if b['properties']['building_id']==bid)
    pois.append(point(b['geometry']['coordinates'],{'poi_id':pid,'building_id':bid,'name':name,'aliases':alt,'category':'dining'}))
journeys=[
 {'id':'goodwin-dds','required_ways':[50032697],'from':['VT-GOODWIN'],'to':['VT-DDS'],'start_node':5879642862,'end_node':12206940090,'via':[5879642846],'label':'via the north path · DDS side entrance'},
 {'id':'perry-pamplin','required_ways':[1560765611],'from':['POI-PERRY-PLACE','VT-HITT'],'to':['VT-PAMPLIN'],'start_node':12668644363,'end_node':702995777,'via':[691034622],'label':'via Derring Hall'},
 {'id':'davidson-ncb','required_ways':[1560765613],'from':['VT-DAVIDSON'],'to':['VT-NCB'],'start_node':11638044097,'end_node':5883236545,'via':[690880137,10003148272],'label':'via Hahn Hall North'},
 {'id':'turner-newman','required_ways':[1199644146,1560765614],'from':['POI-TURNER-PLACE','VT-LAVERY-HALL'],'to':['VT-NEWMAN-LIB'],'start_node':3769532297,'end_node':14200809376,'via':[11126429086,370914375],'label':'via Upper Quad & Torgersen Bridge'}
]
for j in journeys:
    for n in [j['start_node'],j['end_node'],*j['via']]:
        if n not in all_routable:raise ValueError(f'Demo waypoint {n} is not on an OSM path')
write('buildings.geojson',fc(buildings));write('entrances.geojson',fc(entrances));write('paths.geojson',fc(paths));write('pois.geojson',fc(pois));write('closures.geojson',fc(closures))
manifest={'title':'Camp Path','source_url':URL,'attribution':'© OpenStreetMap contributors','license':'ODbL','snapshot_timestamp':root.find('meta').get('osm_base') if root.find('meta') is not None else datetime.datetime.now(datetime.timezone.utc).isoformat(),'built_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'buildings':len(buildings),'segments':len(paths),'closed_segments':sum(f['properties']['closed'] for f in paths),'stair_segments':sum(f['properties']['steps'] for f in paths),'construction_areas':len(closures),'node_mapping':node_map,'way_mapping':way_map,'journeys':journeys,'excluded':dict(excluded),'routing':'OSM node identity; no proximity-created path edges; supplied OSC replaces screenshot routes'}
write('camp-path-manifest.json',manifest)
(ROOT/'reports/CAMP_PATH_COVERAGE.json').write_text(json.dumps({'coverage':coverage,'main_component_nodes':len(main),'manifest':manifest},indent=2)+'\n')
print(json.dumps({k:manifest[k] for k in ['buildings','segments','closed_segments','stair_segments','construction_areas']},indent=2))
print('Nearby-path arrivals:',sum(b['properties']['arrival_kind']=='nearby_path' for b in buildings))
print('Disconnected without stairs:',[b['name'] for b in coverage if not b['connected_without_stairs']])
