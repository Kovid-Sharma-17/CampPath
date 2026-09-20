import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {buildGraph,findRoute,resolvePlace} from '../dist/router.mjs';

const names={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json'};
const source=Object.fromEntries(Object.entries(names).map(([key,file])=>[key,JSON.parse(readFileSync(new URL('../dist/data/'+file,import.meta.url),'utf8'))]));
const now=new Date('2026-09-19T16:00:00Z');
const graph=()=>buildGraph(source,{now});
const statusData=rows=>({...source,status:rows});

test('imports the comprehensive OpenStreetMap network and every campus building',()=>{
  const g=graph();
  assert.equal(g.buildings.size,113);
  assert.ok(g.entrances.size>100,'every building without a surveyed door should still get an approach point');
  assert.ok(g.edges.length>5000,'the OSM pull should be the whole-campus network, not a handful of hand-drawn shortcuts');
  assert.equal(resolvePlace(g,'VT-NEWMAN-LIB').type,'building');
  assert.equal(resolvePlace(g,'not-a-real-place'),null);
});
test('resolvePlace matches by id, name, and known aliases only',()=>{
  const g=graph();
  const perry=resolvePlace(g,'Perry Place');
  assert.ok(perry,'Perry Place should still resolve as a POI');
  assert.equal(resolvePlace(g,'perry place').id,perry.id,'lookup is case-insensitive');
});
test('most campus building pairs are actually routable on the comprehensive network',()=>{
  const g=graph();
  const ids=[...g.buildings.keys()];
  let found=0,checked=0;
  const rng=(seed=>()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff))(42);
  for(let i=0;i<150;i++){
    const a=ids[Math.floor(rng()*ids.length)],b=ids[Math.floor(rng()*ids.length)];
    if(a===b)continue;
    checked++;
    if(findRoute(g,a,b).found)found++;
  }
  assert.ok(checked>100);
  assert.ok(found/checked>0.75,`expected most sampled pairs to route; got ${found}/${checked}`);
});
test('a concrete route between two well-known places is found with sane geometry',()=>{
  const g=graph();
  const r=findRoute(g,'POI-PERRY-PLACE','VT-PAMPLIN');
  assert.ok(r.found);
  assert.ok(r.meters>0&&r.meters<1000);
  assert.ok(r.legs.length>0);
  for(let i=1;i<r.legs.length;i++){
    const prevEnd=r.legs[i-1].coordinates.at(-1),curStart=r.legs[i].coordinates[0];
    assert.deepEqual(prevEnd,curStart,'consecutive legs should share an exact coordinate, not just be close');
  }
});
test('closing a real entrance removes it from any route that used it',()=>{
  const g=buildGraph(source,{now,closedAssets:['DOOR-VT-OWENS-HALL-1']});
  const entrance=g.entrances.get('N-DOOR-VT-OWENS-HALL-1');
  assert.equal(entrance.operational_status,'closed');
  const r=findRoute(g,'POI-PERRY-PLACE','VT-OWENS-HALL');
  if(r.found)assert.notEqual(r.startEntrance?.entrance_id,'DOOR-VT-OWENS-HALL-1'),assert.notEqual(r.endEntrance?.entrance_id,'DOOR-VT-OWENS-HALL-1');
});
test('access=private/no OSM ways are excluded from routing',()=>{
  const g=graph();
  const restricted=[...g.edges].find(e=>e.access_control==='restricted');
  assert.ok(restricted,'the imported network should contain at least one restricted-access way to test against');
  const ids=[...g.buildings.keys()];
  const rng=(seed=>()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff))(7);
  for(let i=0;i<80;i++){
    const a=ids[Math.floor(rng()*ids.length)],b=ids[Math.floor(rng()*ids.length)];
    if(a===b)continue;
    const r=findRoute(g,a,b);
    if(r.found)assert.ok(r.legs.every(l=>l.id!==restricted.id));
  }
});
test('future reports do not prematurely close an asset',()=>{
  const anyPath=source.paths.features[0].properties.segment_id;
  const g=buildGraph(statusData([{asset_id:anyPath,status:'closed',reported_at:'2026-09-20T00:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'scheduled');
  assert.notEqual(g.assets.get(anyPath).operational_status,'closed');
});
test('expired closures become unknown rather than staying closed',()=>{
  const anyPath=source.paths.features[0].properties.segment_id;
  const g=buildGraph(statusData([{asset_id:anyPath,status:'closed',reported_at:'2026-09-18T00:00:00Z',expected_end:'2026-09-19T12:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'expired');
  assert.equal(g.assets.get(anyPath).operational_status,'unknown');
});
test('an invalid status value is flagged and not applied',()=>{
  const anyPath=source.paths.features[0].properties.segment_id;
  const g=buildGraph(statusData([{asset_id:anyPath,status:'sideways',reported_at:'2026-09-18T00:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'invalid status');
});
test('a report for an unknown asset is logged without throwing',()=>{
  const g=buildGraph(statusData([{asset_id:'NOT-A-REAL-ASSET',status:'closed',reported_at:'2026-09-18T00:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'unknown asset');
});
test('same mapped place and unknown inputs return clear results',()=>{
  const g=graph();
  assert.equal(findRoute(g,'POI-PERRY-PLACE','POI-PERRY-PLACE').meters,0);
  assert.equal(findRoute(g,'not-a-place','VT-PAMPLIN').found,false);
});
test('status application and simulations leave imported data immutable',()=>{
  const before=JSON.stringify(source);
  buildGraph(source,{now,closedAssets:[source.paths.features[0].properties.segment_id]});
  assert.equal(JSON.stringify(source),before);
});
test('graph path endpoints share canonical entrance and junction coordinates',()=>{
  const g=graph();
  for(const e of g.edges){
    assert.deepEqual(e.coordinates[0],g.nodes.get(e.from_node).coordinates,e.id);
    assert.deepEqual(e.coordinates.at(-1),g.nodes.get(e.to_node).coordinates,e.id);
  }
});
test('the running app disables closures while retaining their legend',()=>{
  const g=buildGraph(source,{now,enableClosures:false,closedAssets:[source.paths.features[0].properties.segment_id]});
  assert.ok([...g.assets.values()].every(a=>a.operational_status!=='closed'&&!a.simulated));
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  assert.match(html,/legend-closed/);
  assert.doesNotMatch(html,/id="(?:closure|scenario|simulate)[^"]*"/);
  assert.doesNotMatch(app,/closedAsset/);
  assert.match(app,/enableClosures:false/);
});
test('all imported floorplan references exist and special sheets are not ordinary floor numbers',()=>{
  const index=JSON.parse(readFileSync(new URL('../dist/data/floorplans.json',import.meta.url),'utf8'));
  const plans=Object.values(index).flatMap(b=>b.plans);assert.equal(plans.length,41);
  for(const p of plans)assert.ok(existsSync(new URL('../dist/'+p.file,import.meta.url)));
  assert.equal(index['VT-TORGERSEN'].plans.find(p=>p.code==='17').label,'Penthouse');
  assert.equal(index['VT-NEWMAN-LIB'].plans.length,0);assert.equal(index['VT-GOODWIN'].plans.length,0);assert.equal(index['VT-CFA'].plans.length,0);
});
