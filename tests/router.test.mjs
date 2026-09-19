import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {buildGraph,compareRoutes,findRoute,resolvePlace} from '../dist/router.mjs';

const names={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',connectors:'connectors.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json'};
const source=Object.fromEntries(Object.entries(names).map(([key,file])=>[key,JSON.parse(readFileSync(new URL('../dist/data/'+file,import.meta.url),'utf8'))]));
const now=new Date('2026-09-19T16:00:00Z');
const graph=()=>buildGraph(source,{now});
const pair=['POI-PERRY-PLACE','VT-PAMPLIN'];
const statusData=rows=>({...source,status:rows});

test('imports the complete supplied pilot and resolves stable place IDs',()=>{
  const g=graph();assert.equal(g.buildings.size,16);assert.equal(g.entrances.size,32);assert.equal(g.edges.length,64);assert.equal(g.connectors.length,19);assert.equal(g.places.length,24);
  assert.equal(resolvePlace(g,'Perry Place').node,'N-HITT-E1');
  assert.equal(resolvePlace(g,'VT-NEWMAN-LIB').type,'building');
  assert.equal(resolvePlace(g,'Newman'),null);
});
test('Perry Place to Pamplin comparison uses Derring and saves approximately 68 m',()=>{
  const r=compareRoutes(graph(),...pair);assert.ok(r.indoor.found&&r.outdoor.found);
  assert.ok(Math.abs(r.indoor.meters-359.58)<.1);assert.ok(Math.abs(r.outdoor.meters-427.50)<.1);
  assert.ok(Math.abs(r.savedMeters-67.92)<.1);assert.ok(r.indoor.legs.some(l=>l.id==='IND-DERRING-1'));
  assert.equal(r.indoor.unverifiedPercent,100);assert.ok(r.outdoor.legs.every(l=>!l.is_indoor));
});
test('verified step-free and unknown-exclusion requests fail without relaxing preferences',()=>{
  assert.equal(findRoute(graph(),...pair,{requireStepFree:true}).found,false);
  assert.equal(findRoute(graph(),...pair,{avoidUnknown:true}).found,false);
});
test('closing Derring shortcut reroutes and restoring rebuilds the baseline',()=>{
  const closed=buildGraph(source,{now,closedAssets:['IND-DERRING-1']});
  const r=findRoute(closed,...pair);assert.ok(r.found);assert.ok(!r.legs.some(l=>l.id==='IND-DERRING-1'));
  assert.ok(r.meters>420);assert.ok(findRoute(graph(),...pair).meters<370);
});
test('entrance closure affects physical paths, virtual endpoint links, and both directions',()=>{
  const g=buildGraph(source,{now,closedAssets:['VT-PAMPLIN-EW']});
  for(const pairToCheck of [pair,[...pair].reverse()]){
    const r=findRoute(g,...pairToCheck);assert.ok(r.found);
    assert.ok(r.legs.every(l=>l.from!=='N-PAMPLIN-EW'&&l.to!=='N-PAMPLIN-EW'));
    assert.notEqual(r.endEntrance?.entrance_id,'VT-PAMPLIN-EW');
    assert.notEqual(r.startEntrance?.entrance_id,'VT-PAMPLIN-EW');
  }
});
test('future reports do not prematurely close a path',()=>{
  const g=buildGraph(statusData([{asset_id:'IND-DERRING-1',status:'closed',reported_at:'2026-09-20T00:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'scheduled');assert.ok(findRoute(g,...pair).legs.some(l=>l.id==='IND-DERRING-1'));
});
test('expired closures become unknown rather than verified open',()=>{
  const g=buildGraph(statusData([{asset_id:'IND-DERRING-1',status:'closed',reported_at:'2026-09-18T00:00:00Z',expected_end:'2026-09-19T12:00:00Z',confidence:'official'}]),{now});
  assert.equal(g.statusLog[0].result,'expired');assert.equal(g.assets.get('IND-DERRING-1').operational_status,'unknown');
  assert.equal(g.assets.get('IND-DERRING-1').operational_confidence,'inferred');
});
test('official availability reports never upgrade entrance accessibility evidence',()=>{
  const g=buildGraph(statusData([{asset_id:'VT-PAMPLIN-EW',status:'available',reported_at:'2026-09-18T00:00:00Z',confidence:'official'}]),{now});
  const entrance=g.assets.get('VT-PAMPLIN-EW');assert.equal(entrance.confidence,'inferred');assert.equal(entrance.operational_confidence,'official');
  assert.equal(findRoute(g,...pair,{requireStepFree:true}).found,false);
});
test('ambiguous legacy unknown means operational status; explicit field overrides it',()=>{
  const g=buildGraph(statusData([{asset_id:'VT-PAMPLIN-EW',status:'unknown',reported_at:'2026-09-18T00:00:00Z',confidence:'official'}]),{now});
  assert.equal(g.statusLog[0].field,'operational_status');assert.equal(g.assets.get('VT-PAMPLIN-EW').confidence,'inferred');
  const explicit=buildGraph(statusData([{asset_id:'VT-PAMPLIN-EW',status_field:'accessibility_status',status:'unknown',reported_at:'2026-09-18T00:00:00Z',confidence:'official'}]),{now});
  assert.equal(explicit.statusLog[0].field,'accessibility_status');
});
test('connectors with a known mechanism are routable; connectors with no confirmed mechanism stay unmapped',()=>{
  const g=graph();
  const known=g.connectors.filter(c=>c.connector_type!=='unknown'),unconfirmed=g.connectors.filter(c=>c.connector_type==='unknown');
  assert.equal(known.length,12);assert.equal(unconfirmed.length,7);
  assert.ok(known.every(c=>!c.unmapped));assert.ok(unconfirmed.every(c=>c.unmapped));
  for(const e of g.edges.filter(e=>e.id==='IND-TORG-NEWMAN'||e.id==='IND-WHIT-DURHAM'))assert.equal(e.unmapped,true);
  for(const a of g.places)for(const b of g.places){const r=findRoute(g,a.id,b.id);if(r.found)assert.ok(r.legs.every(e=>!e.unmapped&&e.kind!=='virtual'&&!e.from.startsWith('B:')&&!e.to.startsWith('B:')));}
});
test('Hitt Hall’s elevator and stairs are wired to floor 1 and respond to closures',()=>{
  const g=graph();
  const fromL1=(g.adj.get('N-HITT-L1')||[]).map(e=>e.to);
  assert.ok(fromL1.includes('N-HITT-L3'));assert.ok(fromL1.includes('N-HITT-L2'));
  const elevator=(g.adj.get('N-HITT-L1')||[]).find(e=>e.to==='N-HITT-L3');
  assert.equal(elevator.kind,'elevator');assert.equal(elevator.fixedSeconds,45);assert.equal(elevator.unmapped,false);
  const stairs=(g.adj.get('N-HITT-L1')||[]).find(e=>e.to==='N-HITT-L2');
  assert.equal(stairs.fixedSeconds,25);
  assert.ok((g.adj.get('N-HITT-E1')||[]).some(e=>e.to==='N-HITT-L1'));
  assert.ok((g.adj.get('N-HITT-E2')||[]).some(e=>e.to==='N-HITT-L1'));
  const closed=buildGraph(source,{now,closedAssets:['VT-HITT-ELEV-1']});
  assert.equal((closed.adj.get('N-HITT-L1')||[]).find(e=>e.to==='N-HITT-L3').operational_status,'closed');
});
test('the Whittemore bridge is wired but stays unreachable from its own entrances, since no floor-1 link was surveyed',()=>{
  const g=graph();
  assert.ok((g.adj.get('N-WHITTEMORE-L3')||[]).some(e=>e.kind==='bridge'&&e.unmapped===false));
  for(const e of ['N-WHITTEMORE-E1','N-WHITTEMORE-E2'])assert.ok(!(g.adj.get(e)||[]).some(edge=>edge.to.startsWith('N-WHITTEMORE-L')));
});
test('same mapped entrance and unknown inputs return clear results',()=>{
  const g=graph();assert.equal(findRoute(g,'POI-PERRY-PLACE','POI-PERRY-PLACE').meters,0);
  const virtualOnly=findRoute(g,'VT-HITT','POI-PROCON');
  assert.equal(virtualOnly.found,true);assert.equal(virtualOnly.sameEntrance,true);assert.equal(virtualOnly.meters,null);assert.equal(virtualOnly.unverifiedPercent,null);assert.deepEqual(virtualOnly.legs,[]);
  assert.equal(findRoute(g,'not-a-place','VT-PAMPLIN').found,false);
});
test('restricted indoor passages are excluded',()=>{
  const copied=structuredClone(source);copied.paths.features.find(f=>f.properties.segment_id==='IND-DERRING-1').properties.access_control='swipe_required';
  assert.ok(!findRoute(buildGraph(copied,{now}),...pair).legs.some(l=>l.id==='IND-DERRING-1'));
});
test('status application and simulations leave imported data immutable',()=>{
  const before=JSON.stringify(source);buildGraph(source,{now,closedAssets:['SEG-001','VT-PAMPLIN-EW']});assert.equal(JSON.stringify(source),before);
});
test('all imported floorplan references exist and special sheets are not ordinary floor numbers',()=>{
  const index=JSON.parse(readFileSync(new URL('../dist/data/floorplans.json',import.meta.url),'utf8'));
  const plans=Object.values(index).flatMap(b=>b.plans);assert.equal(plans.length,41);
  for(const p of plans)assert.ok(existsSync(new URL('../dist/'+p.file,import.meta.url)));
  assert.equal(index['VT-TORGERSEN'].plans.find(p=>p.code==='17').label,'Penthouse');
  assert.equal(index['VT-NEWMAN-LIB'].plans.length,0);assert.equal(index['VT-GOODWIN'].plans.length,0);assert.equal(index['VT-CFA'].plans.length,0);
});
