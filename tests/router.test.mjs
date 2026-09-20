import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildGraph,findRoute,resolvePlace,haversine,routeProgress,navigationDecision} from '../dist/router.mjs';
const files={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',pois:'pois.geojson',metadata:'camp-path-manifest.json',closures:'closures.geojson'};
const data=Object.fromEntries(Object.entries(files).map(([k,f])=>[k,JSON.parse(fs.readFileSync(new URL('../dist/data/'+f,import.meta.url)))]));
const graph=buildGraph(data);
const valid=r=>{assert.ok(r.found,r.reason);assert.ok(r.meters>0);assert.ok(r.legs.every(l=>!l.closed&&!l.steps));for(let i=1;i<r.legs.length;i++)assert.ok(haversine(r.legs[i-1].coordinates.at(-1),r.legs[i].coordinates[0])<.01,'Route has a geometry gap');};
test('OSM snapshot and supplied overlay are reconciled without negative or screenshot edges',()=>{
 assert.equal(graph.buildings.size,113);assert.equal(data.closures.features.length,3);
 assert.ok(Object.values(data.metadata.node_mapping).every(n=>n>0));assert.ok(Object.values(data.metadata.way_mapping).every(n=>n>0));
 assert.ok(graph.edges.every(e=>e.source==='OpenStreetMap'&&e.source_way_id>0));
 const ids=new Set();for(const e of graph.edges){const key=[e.from_node,e.to_node].sort().join(':')+':'+e.layer+':'+(e.tags.level||'');assert.ok(!ids.has(key),'Duplicate physical edge '+key);ids.add(key);}
 assert.equal(resolvePlace(graph,'Newman Library').id,'VT-NEWMAN-LIB');assert.equal(resolvePlace(graph,'Turner Place').id,'POI-TURNER-PLACE');
});
for(const [id,way,start,end] of [
 ['goodwin-dds',50032697,5879642862,12206940090],
 ['perry-pamplin',1560765611,12668644363,702995777],
 ['davidson-ncb',1560765613,11638044097,5883236545],
 ['turner-newman',1199644146,3769532297,14200809376]
])test(id+' follows the requested campus passage in both directions',()=>{
 const j=data.metadata.journeys.find(j=>j.id===id),r=findRoute(graph,j.from[0],j.to[0]),back=findRoute(graph,j.to[0],j.from[0]);valid(r);valid(back);
 assert.equal(r.legs[0].from,'N-OSM-'+start);assert.equal(r.legs.at(-1).to,'N-OSM-'+end);assert.ok(r.legs.some(e=>e.source_way_id===way||e.source_way_ids?.includes(way)));
 assert.ok(Math.abs(r.meters-back.meters)<.1);if(id==='turner-newman')assert.ok(r.legs.some(e=>e.source_way_id===1560765614));
});
test('every open catalog destination is connected to Burruss without mapped stairs',()=>{
 for(const p of graph.places.filter(p=>p.type==='building'&&!p.under_construction)){for(const [a,b] of [['VT-BURRUSS',p.id],[p.id,'VT-BURRUSS']]){const r=findRoute(graph,a,b);assert.ok(r.found,p.name+': '+r.reason);assert.ok(r.legs.every(e=>!e.closed&&!e.steps));}}
});
test('construction and explicit stair filtering are real routing constraints',()=>{
 const fixture={buildings:{features:[['A',0],['B',2]].map(([id,x])=>({geometry:{coordinates:[x,0]},properties:{building_id:id,name:id}}))},entrances:{features:[['A','a'],['B','b']].map(([building_id,node_id])=>({geometry:{coordinates:[0,0]},properties:{entrance_id:node_id,node_id,building_id}}))},paths:{features:[{geometry:{coordinates:[[0,0],[.001,0]]},properties:{segment_id:'stairs',from_node:'a',to_node:'b',steps:true}},{geometry:{coordinates:[[0,0],[0,.001],[.001,0]]},properties:{segment_id:'construction',from_node:'a',to_node:'b',closed:true}}]},pois:{features:[]}};
 const g=buildGraph(fixture);assert.equal(findRoute(g,'A','B').found,false);const r=findRoute(g,'A','B',{avoidStairs:false});assert.ok(r.found);assert.equal(r.legs[0].id,'stairs');
});
test('a closed requested passage fails instead of using a fabricated or legacy route',()=>{
 const j=data.metadata.journeys[1];const closed=graph.edges.filter(e=>e.source_way_id===1560765611).map(e=>e.id);
 const r=findRoute(graph,j.from[0],j.to[0],{closedAssets:closed});assert.equal(r.found,false);
});
test('nearby-path arrival and under-construction building states are explicit',()=>{
 const approx=graph.places.find(p=>p.arrival_kind==='nearby_path'&&!p.under_construction),r=findRoute(graph,'VT-BURRUSS',approx.id);assert.ok(r.found);assert.equal(r.endEntrance.kind,'nearby_path');
 const closed=graph.places.find(p=>p.under_construction);assert.equal(findRoute(graph,'VT-BURRUSS',closed.id).found,false);
});
test('GPS projects onto a real eligible edge, rejects distant fixes, and leaves graph unchanged',()=>{
 const j=data.metadata.journeys[0],r=findRoute(graph,j.from[0],j.to[0]),coords=r.legs[2].coordinates,p=coords[0],count=graph.nodes.size;
 const live=findRoute(graph,'GPS','VT-DDS',{gps:p});valid(live);assert.equal(live.gpsSnap.meters,0);assert.equal(graph.nodes.size,count);
 assert.equal(findRoute(graph,'GPS','VT-DDS',{gps:[0,0]}).found,false);
 const progress=routeProgress(r,r.legs.at(-1).coordinates.at(-1));assert.ok(progress.remaining<1);assert.equal(navigationDecision(progress,5).action,'arrive');
});
test('GPS uncertainty and repeated deviation gate rerouting and arrival',()=>{
 const p={offRoute:55,remaining:100,arrivalDistance:100};assert.equal(navigationDecision(p,80,2).action,'wait');
 assert.equal(navigationDecision(p,5,0).action,'follow');assert.equal(navigationDecision(p,5,1).action,'follow');assert.equal(navigationDecision(p,5,2).action,'reroute');
 assert.equal(navigationDecision({offRoute:0,remaining:10,arrivalDistance:35},5).action,'follow');
});
