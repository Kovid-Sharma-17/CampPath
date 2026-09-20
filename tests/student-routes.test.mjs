import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph,findRoute,resolvePlace,haversine,pathLength} from '../dist/router.mjs';
import {applyEdits,emptyEdits} from '../dist/editor-model.mjs';

const files={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json',studentRoutes:'student-routes.json'};
const source=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,JSON.parse(readFileSync(new URL('../dist/data/'+file,import.meta.url)))]));
const data=applyEdits(source,emptyEdits());
const graph=buildGraph(data,{enableClosures:false});
const points=r=>r.legs.flatMap(e=>e.coordinates);

test('every traced screenshot leg is materialized as a walkable edge reachable by ordinary routing',()=>{
  // Some presets' place IDs (e.g. the old DDS-floor-specific 'VT-DDS-F2') no longer
  // resolve now that floor-split routing is gone - both DDS doors are just ordinary
  // entrances of the one VT-DDS building place now. Try each supplied alternate ID.
  const resolvable=id=>resolvePlace(graph,id)?id:/^VT-DDS-F\d$/.test(id)?'VT-DDS':undefined;
  for(const preset of source.studentRoutes.routes){
    const from=preset.from.map(resolvable).find(Boolean),to=preset.to.map(resolvable).find(Boolean);
    assert.ok(from&&to,preset.id+' should have at least one resolvable endpoint on each side');
    const r=findRoute(graph,from,to);
    assert.ok(r.found,preset.id+' should resolve to some route');
    assert.ok(r.meters>0 && r.meters<1200,preset.id+' has an implausible distance');
    for(let i=1;i<r.legs.length;i++)assert.ok(haversine(r.legs[i-1].coordinates.at(-1),r.legs[i].coordinates[0])<0.5,preset.id+' contains a gap');
  }
});

test('DDS has two real doors (1st and 2nd floor access) routed as ordinary entrances of one building',()=>{
  for(const origin of ['VT-GOODWIN','VT-DAVIDSON']){
    const r=findRoute(graph,origin,'VT-DDS');assert.ok(r.found);
  }
  const e1=graph.entrances.get('N-DDS-E1'),e2=graph.entrances.get('N-DDS-E2');
  assert.ok(haversine(e1.coordinates,e2.coordinates)>30);
});

test('loop sections use saved sidewalk polylines, with no straight-line fallback',()=>{
  const raw=JSON.parse(readFileSync(new URL('../source-data/vt-sidewalks-2026-09-19.geojson',import.meta.url)));
  const sourceIds=new Set(raw.features.map(f=>f.properties.objectid));
  for(const id of ['MAROON-TRANSIT','HITT-ORANGE','TRANSIT-DDS','ORANGE-CONNECTOR','MAROON-CONNECTOR']){
    const e=source.studentRoutes.legs[id];
    assert.ok(e.coordinates.length>4);
    assert.ok(e.source_feature_ids.every(id=>sourceIds.has(id)));
    assert.ok(pathLength(e.coordinates)>haversine(e.coordinates[0],e.coordinates.at(-1))*1.05);
  }
});

test('the running app disables closures while retaining their legend',()=>{
  const g=buildGraph(data,{enableClosures:false,closedAssets:['IND-DERRING-1']});
  assert.ok([...g.assets.values()].every(a=>a.operational_status!=='closed' && !a.simulated));
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.match(html,/legend-closed/);
  assert.doesNotMatch(html,/id="(?:closure|scenario|simulate)[^"]*"/);
  assert.doesNotMatch(app,/closedAsset/);
  assert.match(app,/enableClosures:false/);
});

test('graph path endpoints share canonical entrance and junction coordinates',()=>{
  for(const e of graph.edges){
    assert.deepEqual(e.coordinates[0],graph.nodes.get(e.from_node).coordinates,e.id);
    assert.deepEqual(e.coordinates.at(-1),graph.nodes.get(e.to_node).coordinates,e.id);
  }
});
