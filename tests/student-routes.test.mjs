import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph,findRoute,compareRoutes,haversine,pathLength} from '../dist/router.mjs';

const files={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',connectors:'connectors.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json',studentRoutes:'student-routes.json'};
const data=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,JSON.parse(readFileSync(new URL('../dist/data/'+file,import.meta.url)))]));
const graph=buildGraph(data,{enableClosures:false});
const points=r=>r.legs.flatMap(e=>e.coordinates);

test('all seven screenshot choices take their prescribed continuous corridor in both directions',()=>{
  for(const preset of data.studentRoutes.routes){
    const r=findRoute(graph,preset.from[0],preset.to[0]);
    const reverse=findRoute(graph,preset.to[0],preset.from[0]);
    assert.equal(r.referenceId,preset.id);
    assert.deepEqual(points(reverse),points(r).reverse());
    assert.equal(r.unverifiedPercent,100);
    assert.ok(r.meters>50 && r.meters<1100,preset.id+' has an implausible distance');
    for(let i=1;i<r.legs.length;i++)assert.ok(haversine(r.legs[i-1].coordinates.at(-1),r.legs[i].coordinates[0])<0.5,preset.id+' contains a gap');
    for(const from of preset.from)for(const to of preset.to)assert.equal(findRoute(graph,from,to).referenceId,preset.id);
  }
});

test('DDS floors select distinct doors and colors; generic DDS defaults to floor one',()=>{
  for(const origin of ['VT-GOODWIN','VT-DAVIDSON']){
    const first=findRoute(graph,origin,'VT-DDS-F1'),second=findRoute(graph,origin,'VT-DDS-F2');
    assert.equal(first.arrivalFloor,'1');assert.equal(second.arrivalFloor,'2');
    assert.equal(first.color,'red');assert.equal(second.color,'yellow');
    assert.ok(haversine(first.endEntrance.coordinates,second.endEntrance.coordinates)>30);
    assert.deepEqual(points(findRoute(graph,origin,'VT-DDS')),points(first));
  }
  assert.equal(findRoute(graph,'VT-DDS-F1','VT-DDS-F2').found,false);
});

test('no screenshot path is promoted to verified step-free or known conditions',()=>{
  for(const r of data.studentRoutes.routes)for(const preferences of [{requireStepFree:true},{avoidUnknown:true}]){
    assert.equal(findRoute(graph,r.from[0],r.to[0],preferences).found,false);
  }
});

test('indoor passages and outdoor alternatives remain distinct',()=>{
  for(const pair of [['POI-PERRY-PLACE','VT-PAMPLIN'],['VT-PAMPLIN','VT-NCB']]){
    const r=compareRoutes(graph,...pair);
    assert.ok(r.indoor.legs.some(e=>e.is_indoor));
    assert.ok(r.outdoor.legs.every(e=>!e.is_indoor));
    assert.notDeepEqual(points(r.indoor),points(r.outdoor));
    assert.ok(r.indoor.legs.filter(e=>e.is_indoor).every(e=>graph.buildings.has(e.building)));
  }
  assert.equal(findRoute(graph,'VT-DAVIDSON','VT-DDS-F2',{allowIndoor:false}).found,false);
});

test('loop sections use saved sidewalk polylines, with no straight-line fallback',()=>{
  const raw=JSON.parse(readFileSync(new URL('../source-data/vt-sidewalks-2026-09-19.geojson',import.meta.url)));
  const sourceIds=new Set(raw.features.map(f=>f.properties.objectid));
  for(const id of ['MAROON-TRANSIT','HITT-ORANGE','TRANSIT-DDS','ORANGE-CONNECTOR','MAROON-CONNECTOR']){
    const e=data.studentRoutes.legs[id];
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
