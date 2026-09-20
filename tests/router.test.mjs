import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {buildGraph,findRoute,resolvePlace} from '../dist/router.mjs';

const names={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json'};
const source=Object.fromEntries(Object.entries(names).map(([key,file])=>[key,JSON.parse(readFileSync(new URL('../dist/data/'+file,import.meta.url),'utf8'))]));
const now=new Date('2026-09-19T16:00:00Z');
const graph=()=>buildGraph(source,{now});
const pair=['POI-PERRY-PLACE','VT-PAMPLIN'];
const geoPair=['POI-MUSEUM-GEO','VT-PAMPLIN'];
const statusData=rows=>({...source,status:rows});

test('imports the campus building sweep and supplied hand-created paths with stable place IDs',()=>{
  const g=graph();assert.equal(g.buildings.size,113);assert.equal(g.entrances.size,37);assert.equal(g.edges.length,104);assert.equal(g.places.length,121);
  assert.equal(resolvePlace(g,'Perry Place').node,'N-HITT-E1');
  assert.equal(resolvePlace(g,'VT-NEWMAN-LIB').type,'building');
  assert.equal(resolvePlace(g,'Newman'),null);
  for(const id of ['VT-NCB','VT-DAVIDSON','VT-WILLIAMS'])assert.ok(resolvePlace(g,id),id+' should resolve');
});
test('Perry Place to Pamplin finds the mapped shortest route',()=>{
  const r=findRoute(graph(),...pair);assert.ok(r.found);
  assert.ok(Math.abs(r.meters-189.33)<.1);assert.equal(r.legs.length,4);
});
test('Museum of Geosciences (inside Derring’s north entrance) to Pamplin uses the indoor shortcut',()=>{
  const r=findRoute(graph(),...geoPair);assert.ok(r.found);
  assert.ok(Math.abs(r.meters-115.44)<.1);assert.ok(r.legs.some(l=>l.id==='IND-DERRING-1'));
});
test('closing Derring shortcut reroutes the Museum-of-Geosciences pair and restoring rebuilds the baseline',()=>{
  const closed=buildGraph(source,{now,closedAssets:['IND-DERRING-1']});
  const r=findRoute(closed,...geoPair);assert.ok(r.found);assert.ok(!r.legs.some(l=>l.id==='IND-DERRING-1'));
  assert.ok(r.meters>findRoute(graph(),...geoPair).meters);
});
test('the old north/NE-corner route to Derring’s north entrance (SEG-032/033/034) still exists - not deleted, just no longer the shortest option',()=>{
  const g=graph();
  assert.ok((g.adj.get('J-WCD-N')||[]).some(e=>e.to==='N-DERRING-EN'));
  for(const id of ['SEG-032','SEG-033','SEG-034'])assert.ok(g.edges.some(e=>e.id===id));
});
test('New Classroom Building, Davidson Hall, and Williams Hall connect into the cluster via rider-supplied route shapes',()=>{
  const g=graph();
  const hittToNcb=findRoute(g,'POI-PERRY-PLACE','VT-NCB');
  assert.ok(hittToNcb.found);assert.ok(hittToNcb.meters<250);
  const pamplinToNcb=findRoute(g,'VT-PAMPLIN','VT-NCB');
  assert.ok(pamplinToNcb.found);
  assert.ok(['SEG-041','SEG-042','SEG-044'].every(id=>pamplinToNcb.legs.some(l=>l.id===id)));
  const davidsonToNcb=findRoute(g,'VT-DAVIDSON','VT-NCB');
  assert.ok(davidsonToNcb.found);
  assert.ok(['SEG-045','SEG-046'].every(id=>davidsonToNcb.legs.some(l=>l.id===id)));
});
test('Goodwin to D&DS has a direct Prices Fork Rd option alongside the existing shorter one via Goodwin’s east entrance',()=>{
  const g=graph();
  const direct=(g.adj.get('N-GOODWIN-E1')||[]).find(e=>e.to==='N-DDS-E1');
  assert.ok(direct,'direct Prices Fork Rd segment should exist in the graph even though it is not the Dijkstra-shortest pick');
  const e1=g.entrances.get('N-DDS-E1'),e2=g.entrances.get('N-DDS-E2');
  assert.ok(e1.notes.includes('1st floor'));assert.ok(e2.notes.includes('2nd floor'));
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
  assert.equal(g.statusLog[0].result,'scheduled');assert.ok(findRoute(g,...geoPair).legs.some(l=>l.id==='IND-DERRING-1'));
});
test('expired closures become unknown rather than closed',()=>{
  const g=buildGraph(statusData([{asset_id:'IND-DERRING-1',status:'closed',reported_at:'2026-09-18T00:00:00Z',expected_end:'2026-09-19T12:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'expired');assert.equal(g.assets.get('IND-DERRING-1').operational_status,'unknown');
});
test('an invalid status value is flagged and not applied',()=>{
  const g=buildGraph(statusData([{asset_id:'VT-PAMPLIN-EW',status:'sideways',reported_at:'2026-09-18T00:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'invalid status');
});
test('a report for an unknown asset is logged without throwing',()=>{
  const g=buildGraph(statusData([{asset_id:'NOT-A-REAL-ASSET',status:'closed',reported_at:'2026-09-18T00:00:00Z',source:'demo'}]),{now});
  assert.equal(g.statusLog[0].result,'unknown asset');
});
test('same mapped entrance and unknown inputs return clear results',()=>{
  const g=graph();assert.equal(findRoute(g,'POI-PERRY-PLACE','POI-PERRY-PLACE').meters,0);
  const virtualOnly=findRoute(g,'VT-HITT','POI-PROCON');
  assert.equal(virtualOnly.found,true);assert.equal(virtualOnly.sameEntrance,true);assert.equal(virtualOnly.meters,null);assert.deepEqual(virtualOnly.legs,[]);
  assert.equal(findRoute(g,'not-a-place','VT-PAMPLIN').found,false);
});
test('restricted indoor passages are excluded',()=>{
  const copied=structuredClone(source);copied.paths.features.find(f=>f.properties.segment_id==='IND-DERRING-1').properties.access_control='swipe_required';
  assert.ok(!findRoute(buildGraph(copied,{now}),...geoPair).legs.some(l=>l.id==='IND-DERRING-1'));
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
