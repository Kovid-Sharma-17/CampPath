/** Routes over supplied GeoJSON. Operational and accessibility evidence stay separate. */
export const isConfirmed = value => ['official', 'field_verified'].includes(value);
const OPS = new Set(['available', 'closed', 'unknown']);
const ACCESS = new Set(['step_free', 'stairs', 'limited', 'unknown']);
const UNMAPPED_BRIDGES = new Set(['IND-TORG-NEWMAN', 'IND-WHIT-DURHAM']);
export function haversine(a, b) {
  const rad = Math.PI / 180;
  const x = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}
export function pathLength(coords) { return coords.slice(1).reduce((m, point, i) => m + haversine(coords[i], point), 0); }

export function buildGraph(data, {now = new Date(), closedAssets = []} = {}) {
  const graph = {nodes: new Map(), edges: [], adj: new Map(), buildings: new Map(), entrances: new Map(), assets: new Map(), places: [], statusLog: [], metadata: data.metadata};
  for (const f of data.buildings.features) {
    const p = {...f.properties, coordinates: f.geometry.coordinates};
    graph.buildings.set(p.building_id, p);
    graph.nodes.set('B:' + p.building_id, {coordinates: p.coordinates, building: p.building_id, name: p.name});
    graph.places.push({id: p.building_id, node: 'B:' + p.building_id, name: p.name, building: p.building_id, type: 'building', coordinates: p.coordinates});
  }
  for (const f of data.entrances.features) {
    const p = {...f.properties, coordinates: f.geometry.coordinates, operational_confidence: f.properties.operational_confidence || 'inferred'};
    graph.nodes.set(p.node_id, {coordinates: p.coordinates, building: p.building_id, name: p.entrance_name});
    graph.entrances.set(p.node_id, p); graph.assets.set(p.entrance_id, p);
  }
  for (const f of data.paths.features) {
    const p = f.properties, coordinates = f.geometry.coordinates;
    if (!graph.nodes.has(p.from_node)) graph.nodes.set(p.from_node, {coordinates: coordinates[0], name: 'Campus junction'});
    if (!graph.nodes.has(p.to_node)) graph.nodes.set(p.to_node, {coordinates: coordinates.at(-1), name: 'Campus junction'});
    const e = {...p, id: p.segment_id, kind: p.is_indoor ? 'indoor' : 'footway', coordinates, meters: pathLength(coordinates), operational_confidence: p.operational_confidence || 'inferred', unmapped: UNMAPPED_BRIDGES.has(p.segment_id)};
    graph.edges.push(e); graph.assets.set(e.id, e);
  }
  graph.connectors = data.connectors.features.map(f => ({...f.properties, id: f.properties.connector_id, kind: f.properties.connector_type, operational_confidence: 'inferred', unmapped: f.properties.connector_type === 'unknown'}));
  for (const c of graph.connectors) graph.assets.set(c.id, c);
  for (const c of graph.connectors) for (const n of [c.from_node, c.to_node]) if (!graph.nodes.has(n)) { const b = graph.buildings.get(c.building_id); graph.nodes.set(n, {coordinates: b?.coordinates, building: c.building_id, name: (b?.name || c.building_id) + ' — upper floor'}); }
  const records = [...(data.status || [])].sort((a, b) => Date.parse(a.reported_at) - Date.parse(b.reported_at));
  for (const row of records) {
    const target = graph.assets.get(row.asset_id), at = Date.parse(row.reported_at), until = row.expected_end ? Date.parse(row.expected_end) : null;
    let result = 'applied';
    if (!target) result = 'unknown asset';
    else if (!Number.isFinite(at) || (row.expected_end && !Number.isFinite(until))) result = 'invalid date';
    else if (at > +now) result = 'scheduled';
    else if (until !== null && until <= +now) result = 'expired';
    const field = row.status_field || (OPS.has(row.status) ? 'operational_status' : ACCESS.has(row.status) ? 'accessibility_status' : null);
    if (!field || !['operational_status', 'accessibility_status'].includes(field) || !(field === 'operational_status' ? OPS : ACCESS).has(row.status)) result = 'invalid status';
    if (target && result === 'expired' && field === 'operational_status') { target.operational_status = 'unknown'; target.operational_confidence = 'inferred'; }
    if (result === 'applied') {
      target[field] = row.status;
      target[field === 'operational_status' ? 'operational_confidence' : 'confidence'] = row.confidence || 'inferred';
      target.status_source = row.source; target.reported_at = row.reported_at;
    }
    graph.statusLog.push({...row, field, result});
  }
  for (const id of closedAssets) { const a = graph.assets.get(id); if (a) { a.operational_status = 'closed'; a.simulated = true; } }
  function link(edge) {
    for (const [from, to, reverse] of [[edge.from_node, edge.to_node, false], [edge.to_node, edge.from_node, true]]) {
      if (!graph.adj.has(from)) graph.adj.set(from, []);
      graph.adj.get(from).push({...edge, from, to, coordinates: reverse ? [...edge.coordinates].reverse() : edge.coordinates});
    }
  }
  graph.edges.forEach(link);
  for (const [node, entrance] of graph.entrances) {
    const centroid = 'B:' + entrance.building_id;
    if (graph.nodes.has(centroid)) link({id: 'VIRT-' + entrance.entrance_id, kind: 'virtual', from_node: centroid, to_node: node, meters: 0, coordinates: [graph.nodes.get(centroid).coordinates, entrance.coordinates]});
  }
  const floorOf = node => { const m = /-L(\d+)$/.exec(node); return m ? Number(m[1]) : null; };
  const floor1 = new Map();
  for (const c of graph.connectors) {
    if (c.unmapped) continue;
    for (const n of [c.from_node, c.to_node]) if (floorOf(n) === 1) floor1.set(n, c.building_id);
    const vertical = c.kind === 'stairs' || c.kind === 'ramp';
    const flights = vertical ? Math.abs((floorOf(c.to_node) ?? 0) - (floorOf(c.from_node) ?? 0)) || 1 : 1;
    const fixedSeconds = (vertical ? 25 : c.kind === 'bridge' ? 10 : 45) * (vertical ? flights : 1);
    link({...c, is_indoor: true, meters: 0, fixedSeconds, coordinates: [graph.nodes.get(c.from_node).coordinates, graph.nodes.get(c.to_node).coordinates]});
  }
  for (const [floorNode, buildingId] of floor1) for (const [entNode, entrance] of graph.entrances) {
    if (entrance.building_id !== buildingId) continue;
    link({id: 'VIRT-FLOOR-' + entrance.entrance_id, kind: 'virtual', from_node: entNode, to_node: floorNode, meters: 0, coordinates: [entrance.coordinates, graph.nodes.get(floorNode).coordinates]});
  }
  for (const f of data.pois.features) {
    const p = f.properties;
    if (graph.nodes.has(p.node_id)) graph.places.push({id: p.poi_id, node: p.node_id, name: p.name, aliases: p.aliases || [], building: p.building_id, type: p.category, coordinates: graph.nodes.get(p.node_id).coordinates});
  }
  return graph;
}
export function resolvePlace(graph, query) {
  const q = String(query || '').trim().toLowerCase();
  return graph.places.find(p => [p.id, p.name, ...(p.aliases || [])].some(v => v.toLowerCase() === q)) || null;
}
function unavailable(asset, prefs) {
  if (asset.operational_status === 'closed') return 'closed';
  if (prefs.avoidStairs && (asset.accessibility_status === 'stairs' || asset.kind === 'stairs')) return 'stairs';
  if (prefs.requireStepFree && (asset.accessibility_status !== 'step_free' || !isConfirmed(asset.confidence))) return 'accessibility is not verified';
  if (prefs.avoidUnknown && (!isConfirmed(asset.confidence) || asset.accessibility_status === 'unknown' || asset.operational_status !== 'available' || !isConfirmed(asset.operational_confidence))) return 'conditions are unknown';
  return null;
}
function blockingReason(graph, edge, prefs) {
  for (const n of [edge.from, edge.to]) { const ent = graph.entrances.get(n); if (ent) { const why = unavailable(ent, prefs); if (why) return why; } }
  if (edge.kind === 'virtual') return null;
  if (edge.unmapped) return 'floor connections are unmapped';
  if (edge.is_indoor && !prefs.allowIndoor) return 'outdoor routes only';
  if (edge.is_indoor && ['restricted', 'swipe_required'].includes(edge.access_control)) return 'restricted building access';
  if (edge.is_indoor && prefs.avoidUnknown && (!edge.open_hours || edge.open_hours === 'unknown')) return 'opening hours are unknown';
  return unavailable(edge, prefs);
}
export function findRoute(graph, from, to, preferences = {}) {
  const prefs = {avoidStairs: true, requireStepFree: false, avoidUnknown: false, allowIndoor: true, ...preferences};
  if (prefs.requireStepFree) prefs.avoidStairs = true;
  const start = resolvePlace(graph, from), end = resolvePlace(graph, to);
  if (!start || !end) return {found: false, reason: 'Choose a starting point and destination from the pilot area.', legs: []};
  if (start.node === end.node) return {found: true, samePlace: true, legs: [], meters: 0, seconds: 0, unverifiedPercent: 0, start, end, indoorBuildings: []};
  const distances = new Map([[start.node, 0]]), previous = new Map(), pending = new Set([start.node]), visited = new Set();
  while (pending.size) {
    const current = [...pending].reduce((a, b) => distances.get(a) <= distances.get(b) ? a : b);
    pending.delete(current); if (current === end.node) break; visited.add(current);
    for (const e of graph.adj.get(current) || []) {
      if (visited.has(e.to) || (e.to.startsWith('B:') && e.to !== end.node) || blockingReason(graph, e, prefs)) continue;
      const candidate = distances.get(current) + e.meters;
      if (candidate < (distances.get(e.to) ?? Infinity)) { distances.set(e.to, candidate); previous.set(e.to, e); pending.add(e.to); }
    }
  }
  if (!distances.has(end.node)) return {found: false, start, end, legs: [], reason: prefs.requireStepFree ? 'No verified step-free route is available in this dataset. Entrances and path accessibility still need to be checked.' : prefs.avoidUnknown ? 'No route has enough verified access and availability information to meet these settings.' : 'No connected route meets these settings. A closure, restricted entrance, or unmapped connection may block the way.'};
  const allLegs = []; let current = end.node;
  while (current !== start.node) { const edge = previous.get(current); allLegs.unshift(edge); current = edge.from; }
  const sameEntrance = allLegs.length > 0 && allLegs.every(e => e.kind === 'virtual');
  if (sameEntrance) {
    return {found: true, sameEntrance: true, legs: [], meters: null, seconds: null, unverifiedPercent: null, start, end, indoorBuildings: [], startEntrance: graph.entrances.get(allLegs[0].to), endEntrance: graph.entrances.get(allLegs.at(-1).from)};
  }
  const legs = allLegs.filter(e => e.kind !== 'virtual').map(e => ({...e, verified: isConfirmed(e.confidence) && e.accessibility_status !== 'unknown', seconds: e.fixedSeconds ?? (e.meters / 1.15 + (e.is_indoor ? 10 : 0))}));
  const meters = legs.reduce((sum, e) => sum + e.meters, 0);
  return {found: true, start, end, legs, meters, seconds: legs.reduce((sum, e) => sum + e.seconds, 0), unverifiedPercent: meters ? Math.round(100 * legs.filter(e => !e.verified).reduce((sum, e) => sum + e.meters, 0) / meters) : 0, indoorBuildings: [...new Set(legs.filter(e => e.is_indoor).flatMap(e => [graph.nodes.get(e.from)?.building, graph.nodes.get(e.to)?.building]).filter(Boolean))], startEntrance: allLegs[0]?.kind === 'virtual' ? graph.entrances.get(allLegs[0].to) : graph.entrances.get(start.node), endEntrance: allLegs.at(-1)?.kind === 'virtual' ? graph.entrances.get(allLegs.at(-1).from) : graph.entrances.get(end.node)};
}
export function compareRoutes(graph, from, to, preferences = {}) {
  const indoor = findRoute(graph, from, to, {...preferences, allowIndoor: true}), outdoor = findRoute(graph, from, to, {...preferences, allowIndoor: false});
  return {indoor, outdoor, savedMeters: indoor.found && outdoor.found ? Math.max(0, outdoor.meters - indoor.meters) : null};
}
