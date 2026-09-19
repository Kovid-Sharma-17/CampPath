"""Compile saved VT sidewalk geometry into a junction/segment network.

No Google data or accessibility classifications are imported. Building approach
points are explicitly not doors. Never bridge gaps to make a coverage count grow.
"""
import argparse
import json
import math
from collections import defaultdict, Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SX=111195*math.cos(math.radians(37.23)); SY=111195
def xy(p): return (p[0]*SX,p[1]*SY)
def distance(a,b): return math.dist(xy(a),xy(b))
def projection(p,a,b):
    px,py=xy(p);ax,ay=xy(a);bx,by=xy(b);dx=bx-ax;dy=by-ay
    t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy or 1)))
    q=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
    return distance(p,q),q,t
def read(name): return json.loads((ROOT/'dist/data'/name).read_text())
def fc(features): return {'type':'FeatureCollection','features':features}
def write(name,value): (ROOT/name).write_text(json.dumps(value,separators=(',',':'))+'\n')

def compile_network(raw):
    coords=[]; lookup={}; edges=[]
    def node(p):
        key=tuple(round(v,7) for v in p[:2])
        if key not in lookup: lookup[key]=len(coords);coords.append(list(key))
        return lookup[key]
    for f in raw['features']:
        geom=f['geometry'];lines=[geom['coordinates']] if geom['type']=='LineString' else geom['coordinates']
        for line in lines:
            for a,b in zip(line,line[1:]):
                u,v=node(a),node(b)
                if u!=v:edges.append((u,v,f['properties']['objectid']))
    grid=defaultdict(list);cell=8
    def cell_of(p):x,y=xy(p);return math.floor(x/cell),math.floor(y/cell)
    for i,p in enumerate(coords):grid[cell_of(p)].append(i)
    split=[]
    # Source vertices that touch another segment form T junctions. A 0.5 m
    # tolerance repairs coordinate noise; it cannot jump across a road.
    for u,v,source in edges:
        a,b=coords[u],coords[v];x1,y1=cell_of(a);x2,y2=cell_of(b)
        hits=[(0,u),(1,v)]
        for gx in range(min(x1,x2)-1,max(x1,x2)+2):
            for gy in range(min(y1,y2)-1,max(y1,y2)+2):
                for w in grid[(gx,gy)]:
                    if w in (u,v):continue
                    d,_,t=projection(coords[w],a,b)
                    if d<=.5 and 0<t<1:hits.append((t,w))
        hits.sort()
        split.extend((a[1],b[1],source) for a,b in zip(hits,hits[1:]) if a[1]!=b[1])
    # Merge nearly coincident endpoints only, never arbitrary close footways.
    parents=list(range(len(coords)))
    def root(i):
        while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
        return i
    for i,p in enumerate(coords):
        x,y=cell_of(p)
        for gx in range(x-1,x+2):
            for gy in range(y-1,y+2):
                for j in grid[(gx,gy)]:
                    if j<i and distance(p,coords[j])<.25:parents[root(i)]=root(j)
    unique={}
    for a,b,s in split:
        a,b=root(a),root(b)
        if a!=b:unique.setdefault(tuple(sorted((a,b))),(a,b,s))
    segments=[{'a':a,'b':b,'points':[coords[a],coords[b]],'sources':[s]} for a,b,s in unique.values()]
    # Keep curves but combine degree-two chains for a compact editable map.
    adj=defaultdict(list)
    for i,e in enumerate(segments):adj[e['a']].append(i);adj[e['b']].append(i)
    visited=set(); chains=[]
    for start in sorted(adj,key=lambda n:len(adj[n])==2):
        for index in adj[start]:
            if index in visited:continue
            points=[coords[start]];sources=set();current=start;edge_index=index
            while True:
                visited.add(edge_index);e=segments[edge_index];sources.update(e['sources'])
                nxt=e['b'] if e['a']==current else e['a'];points.append(coords[nxt])
                if len(adj[nxt])!=2 or nxt==start:break
                candidates=[i for i in adj[nxt] if i not in visited]
                if not candidates:break
                current=nxt;edge_index=candidates[0]
            if len(points)>1:chains.append({'from':'J-VT-'+str(start),'to':'J-VT-'+str(nxt),'points':points,'sources':sorted(sources)})
    return chains

def main():
    ap=argparse.ArgumentParser();ap.add_argument('snapshot',type=Path);args=ap.parse_args()
    raw=json.loads(args.snapshot.read_text());chains=compile_network(raw)
    entrances=read('entrances.geojson')['features'];buildings=read('buildings.geojson')['features'];student=read('student-routes.json')
    core_nodes={}
    for f in read('paths.geojson')['features']:
        p=f['properties'];line=student.get('edgeOverrides',{}).get(p['segment_id'],f['geometry']['coordinates'])
        for key,point in [('from_node',line[0]),('to_node',line[-1])]:
            if '-L' not in p[key]:core_nodes.setdefault(p[key],point)
    for f in entrances:core_nodes[f['properties']['node_id']]=student['entranceCoordinates'].get(f['properties']['node_id'],f['geometry']['coordinates'])
    serial=0
    def nearest(p):
        best=None
        for i,e in enumerate(chains):
            for j,(a,b) in enumerate(zip(e['points'],e['points'][1:])):
                d,q,t=projection(p,a,b)
                if best is None or d<best[0]:best=(d,i,j,q)
        return best
    def split_at(match):
        nonlocal serial
        _,i,j,q=match;e=chains[i]
        if distance(q,e['points'][0])<.5:return e['from'],e['points'][0]
        if distance(q,e['points'][-1])<.5:return e['to'],e['points'][-1]
        serial+=1;node='J-VT-SNAP-'+str(serial)
        tail={**e,'from':node,'points':[q]+e['points'][j+1:]}
        chains[i]={**e,'to':node,'points':e['points'][:j+1]+[q]};chains.append(tail)
        return node,q
    links=[];unlinked=[]
    for node,p in core_nodes.items():
        match=nearest(p)
        if match[0]<=8:
            end,q=split_at(match);links.append({'from':node,'to':end,'points':[p,q],'sources':[],'connection':True})
        else:unlinked.append({'node':node,'gap_m':round(match[0],1)})
    existing_buildings={f['properties']['building_id'] for f in entrances};approaches=[];missing=[]
    for f in buildings:
        b=f['properties'];bid=b['building_id']
        if bid in existing_buildings:continue
        p=f['geometry']['coordinates'];match=nearest(p)
        if match[0]>100:missing.append({'building_id':bid,'name':b['name'],'gap_m':round(match[0],1)});continue
        junction,q=split_at(match);node='N-APPROACH-'+bid
        links.append({'from':node,'to':junction,'points':[q,q],'sources':[],'connection':True})
        approaches.append({'type':'Feature','geometry':{'type':'Point','coordinates':q},'properties':{'entrance_id':'APPROACH-'+bid,'node_id':node,'building_id':bid,'entrance_name':'Nearby sidewalk — door not mapped','node_role':'approach','geometry_precision':'nearest_mapped_sidewalk','accessibility_status':'unknown','operational_status':'unknown','confidence':'inferred','source':'VT sidewalk geometry; nearest approach, not a surveyed entrance','building_offset_m':round(match[0],1)}})
    features=[]
    for i,e in enumerate(chains+links):
        features.append({'type':'Feature','geometry':{'type':'LineString','coordinates':e['points']},'properties':{'segment_id':'VT-WALK-'+str(i+1),'from_node':e['from'],'to_node':e['to'],'name':'Entrance approach (unverified)' if e.get('connection') else 'Campus sidewalk','accessibility_status':'unknown','operational_status':'unknown','confidence':'inferred','geometry_confidence':'inferred' if e.get('connection') else 'official','source':'VT ADA_Routes_Only geometry, 2026-09-19','source_feature_ids':e['sources'],'is_indoor':False,'access_control':'outdoor','surface':'unknown','open_hours':'unknown'}})
    adj=defaultdict(set)
    for f in features:
        p=f['properties'];adj[p['from_node']].add(p['to_node']);adj[p['to_node']].add(p['from_node'])
    component={};sizes=[]
    for n in adj:
        if n in component:continue
        num=len(sizes);stack=[n];component[n]=num;count=0
        while stack:
            u=stack.pop();count+=1
            for v in adj[u]:
                if v not in component:component[v]=num;stack.append(v)
        sizes.append(count)
    main_component=Counter(component[n] for n in core_nodes if n in component).most_common(1)[0][0]
    connected=sum(component.get(f['properties']['node_id'])==main_component for f in approaches)
    report={'source':'VT Enterprise GIS','source_url':'https://arcgis-central.gis.vt.edu/arcgis/rest/services/facilities/ADA_Routes_Only/MapServer/0','source_features':len(raw['features']),'segments':len(features),'nodes':len(adj),'components':len(sizes),'largest_component_nodes':max(sizes),'building_markers':len(buildings),'new_approaches':len(approaches),'new_approaches_on_core_component':connected,'buildings_without_nearby_walkway':missing,'existing_nodes_not_linked':unlinked,'note':'Approaches end on sidewalks; entrances and exits still need marking. Disconnected components are not bridged.'}
    write('dist/data/campus-walkways.geojson',fc(features));write('dist/data/campus-approaches.geojson',fc(approaches))
    write('dist/data/network-manifest.json',{'version':1,'source':'VT campus sidewalks','files':{'paths':'campus-walkways.geojson','entrances':'campus-approaches.geojson'},'summary':report})
    write('reports/NETWORK_IMPORT.json',report)
    print(json.dumps({k:v for k,v in report.items() if not isinstance(v,list)},indent=2))

if __name__=='__main__':main()
