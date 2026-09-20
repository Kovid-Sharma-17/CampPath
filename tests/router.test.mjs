import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {buildGraph,compareRoutes,findRoute,resolvePlace} from '../dist/router.mjs';

const names={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',connectors:'connectors.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json'};
const source=Object.fromEntries(Object.entries(names).map(([key,file])=>[key,JSON.parse(readFileSync(new URL('../dist/data/'+file,import.meta.url),'utf8'))]));
const now=new Date('2026-09-19T16:00:00Z');
const graph=()=>buildGraph(source,{now});
const pair=['POI-PERRY-PLACE','VT-PAMPLIN'];
const geoPair=['POI-MUSEUM-GEO','VT-PAMPLIN'];
const statusData=rows=>({...source,status:rows});

test('imports the campus building sweep and supplied hand-created paths with stable place IDs',()=>{
  const g=graph();assert.equal(g.buildings.size,113);assert.equal(g.entrances.size,37);assert.equal(g.edges.length,106);assert.equal(g.connectors.length,48);assert.equal(g.places.length,121);
  assert.equal(resolvePlace(g,'Perry Place').node,'N-HITT-E1');
  assert.equal(resolvePlace(g,'VT-NEWMAN-LIB').type,'building');
  assert.equal(resolvePlace(g,'Newman'),null);
  for(const id of ['VT-NCB','VT-DAVIDSON','VT-WILLIAMS'])assert.ok(resolvePlace(g,id),id+' should resolve');
});
test('Perry Place to Pamplin: the real west/south route (rider-supplied trace + VT footprints) is now short enough that indoor and outdoor converge - no more shortcut advantage here',()=>{
  // This is a genuine, honest change, not a regression: earlier "68 m saved via Derring"
  // numbers for this specific pair were built on an approximate straight-line guess for
  // the Hitt-area geometry. The corrected route (SEG-031/041/042/035, hugging Derring's
  // real west and south footprint edges) is short enough on its own that detouring through
  // IND-DERRING-1 no longer saves anything for someone starting at Hitt/Perry Place. See
  // the 'Museum of Geosciences' test below for a pair where the indoor shortcut still helps -
  // someone starting at Derring's own north entrance still benefits from cutting through.
  const r=compareRoutes(graph(),...pair);assert.ok(r.indoor.found&&r.outdoor.found);
  assert.ok(Math.abs(r.indoor.meters-r.outdoor.meters)<.1);
  assert.ok(Math.abs(r.indoor.meters-189.33)<.1);
  assert.equal(r.savedMeters,0);
  assert.ok(!r.indoor.legs.some(l=>l.id==='IND-DERRING-1'));
  assert.equal(r.indoor.unverifiedPercent,100);
});
test('Museum of Geosciences (inside Derring’s north entrance) to Pamplin still saves ~68 m via the indoor shortcut',()=>{
  const r=compareRoutes(graph(),...geoPair);assert.ok(r.indoor.found&&r.outdoor.found);
  assert.ok(Math.abs(r.indoor.meters-115.44)<.1);assert.ok(Math.abs(r.outdoor.meters-183.37)<.1);
  assert.ok(Math.abs(r.savedMeters-67.92)<.1);assert.ok(r.indoor.legs.some(l=>l.id==='IND-DERRING-1'));
  assert.equal(r.indoor.unverifiedPercent,100);assert.ok(r.outdoor.legs.every(l=>!l.is_indoor));
});
test('verified step-free and unknown-exclusion requests fail without relaxing preferences',()=>{
  assert.equal(findRoute(graph(),...pair,{requireStepFree:true}).found,false);
  assert.equal(findRoute(graph(),...pair,{avoidUnknown:true}).found,false);
});
test('closing Derring shortcut reroutes the Museum-of-Geosciences pair (which actually depends on it) and restoring rebuilds the baseline',()=>{
  const closed=buildGraph(source,{now,closedAssets:['IND-DERRING-1']});
  const r=findRoute(closed,...geoPair);assert.ok(r.found);assert.ok(!r.legs.some(l=>l.id==='IND-DERRING-1'));
  assert.ok(r.meters>findRoute(graph(),...geoPair).meters);
  assert.ok(findRoute(graph(),...geoPair).meters<130);
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
test('Goodwin to D&DS has a direct Prices Fork Rd option (rider-marked ‘1st floor’) alongside the existing shorter one via Goodwin’s east entrance (rider-marked ‘2nd floor’); neither floor is asserted as confirmed',()=>{
  const g=graph();
  const direct=(g.adj.get('N-GOODWIN-E1')||[]).find(e=>e.to==='N-DDS-E1');
  assert.ok(direct,'direct Prices Fork Rd segment should exist in the graph even though it is not the Dijkstra-shortest pick');
  const e1=g.entrances.get('N-DDS-E1'),e2=g.entrances.get('N-DDS-E2');
  assert.ok(e1.notes.includes('1st floor'));assert.ok(e2.notes.includes('2nd floor'));
  assert.equal(e1.confidence,'inferred');assert.equal(e2.confidence,'inferred');
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
  assert.equal(known.length,41);assert.equal(unconfirmed.length,7);
  assert.ok(known.every(c=>!c.unmapped));assert.ok(unconfirmed.every(c=>c.unmapped));
  for(const e of g.edges.filter(e=>e.id==='IND-TORG-NEWMAN'||e.id==='IND-WHIT-DURHAM'))assert.equal(e.unmapped,true);
  for(const a of g.places)for(const b of g.places){const r=findRoute(g,a.id,b.id);if(r.found)assert.ok(r.legs.every(e=>!e.unmapped&&e.kind!=='virtual'&&!e.from.startsWith('B:')&&!e.to.startsWith('B:')));}
});
test('29 real VT Facilities elevator/chairlift connectors carry official confidence, distinct from the 2006-floorplan-inferred ones',()=>{
  const g=graph();
  assert.equal(g.connectors.filter(c=>c.confidence==='official').length,29);
  assert.ok(g.connectors.filter(c=>c.confidence==='official').every(c=>c.operational_confidence==='official'));
});
test('Derring and Pamplin - previously with zero connector coverage - now have real, routable elevators',()=>{
  const g=graph();
  for(const bid of ['VT-DERRING','VT-PAMPLIN']){
    const real=g.connectors.filter(c=>c.building_id===bid&&c.confidence==='official');
    assert.equal(real.length,2);assert.ok(real.every(c=>!c.unmapped&&c.accessibility_status==='step_free'));
  }
});
test('entrance-to-floor-node links cost real distance and carry unknown accessibility - not a free, unchecked shortcut between a building’s doors',()=>{
  const g=graph();
  const edge=(g.adj.get('N-DERRING-EN')||[]).find(e=>e.to.startsWith('N-DERRING-L'));
  assert.ok(edge);assert.equal(edge.kind,'indoor');assert.equal(edge.accessibility_status,'unknown');assert.ok(edge.meters>0);
  assert.equal(findRoute(g,...pair,{avoidUnknown:true}).found,false,'an unverified floor-hub leg must not let avoidUnknown slip through');
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
test('the Whittemore bridge (floor 3) stays unreachable even though a real elevator now confirms floor-1 access',()=>{
  const g=graph();
  assert.ok((g.adj.get('N-WHITTEMORE-L3')||[]).some(e=>e.kind==='bridge'&&e.unmapped===false));
  // Whittemore's real, official-confidence elevator (00134-ELEV-TRC-*) legitimately links
  // entrances to floor 1 now - that is new, correct behavior, not a bug. But that elevator's
  // single L1<->L6 edge does not stop at L3 as its own node, so the bridge stays unreachable:
  // a real gap in what floors are confirmed, not something to paper over with an invented stop.
  for(const e of ['N-WHITTEMORE-E1','N-WHITTEMORE-E2'])assert.ok((g.adj.get(e)||[]).some(edge=>edge.to==='N-WHITTEMORE-L1'));
  for(const e of ['N-WHITTEMORE-E1','N-WHITTEMORE-E2'])assert.ok(!(g.adj.get(e)||[]).some(edge=>edge.to==='N-WHITTEMORE-L3'));
  assert.ok(!(g.adj.get('N-WHITTEMORE-L1')||[]).some(edge=>edge.to==='N-WHITTEMORE-L3'));
});
test('same mapped entrance and unknown inputs return clear results',()=>{
  const g=graph();assert.equal(findRoute(g,'POI-PERRY-PLACE','POI-PERRY-PLACE').meters,0);
  const virtualOnly=findRoute(g,'VT-HITT','POI-PROCON');
  assert.equal(virtualOnly.found,true);assert.equal(virtualOnly.sameEntrance,true);assert.equal(virtualOnly.meters,null);assert.equal(virtualOnly.unverifiedPercent,null);assert.deepEqual(virtualOnly.legs,[]);
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
