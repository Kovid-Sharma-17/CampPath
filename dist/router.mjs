/** Routes over supplied GeoJSON. Closures (available/closed/unknown) are the only live status tracked. */
export function haversine(a, b) {
  const rad = Math.PI / 180;
  const x = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, x)));
}
export function pathLength(coords) { return coords.slice(1).reduce((m, point, i) => m + haversine(coords[i], point), 0); }

export function buildGraph(data, {now = new Date(), closedAssets = [], enableClosures = true} = {}) {
  const graph = {nodes: new Map(), edges: [], adj: new Map(), buildings: new Map(), entrances: new Map(), assets: new Map(), places: [], statusLog: [], metadata: data.metadata};
  for (const f of data.buildings.features) {
    const p = {...f.properties, coordinates: f.geometry.coordinates};
    graph.buildings.set(p.building_id, p);
    graph.nodes.set('B:' + p.building_id, {coordinates: p.coordinates, building: p.building_id, name: p.name});
    graph.places.push({id: p.building_id, node: 'B:' + p.building_id, name: p.name, building: p.building_id, type: 'building', coordinates: p.coordinates});
  }
  for (const f of data.entrances.features) {
    const p = {...f.properties, coordinates: data.studentRoutes?.entranceCoordinates?.[f.properties.node_id] || f.geometry.coordinates};
    graph.nodes.set(p.node_id, {coordinates: p.coordinates, building: p.building_id, name: p.entrance_name});
    graph.entrances.set(p.node_id, p); graph.assets.set(p.entrance_id, p);
  }
  for (const f of data.paths.features) {
    const p = f.properties, coordinates = data.studentRoutes?.edgeOverrides?.[p.segment_id] || f.geometry.coordinates;
    if (!graph.nodes.has(p.from_node)) graph.nodes.set(p.from_node, {coordinates: coordinates[0], name: 'Campus junction'});
    if (!graph.nodes.has(p.to_node)) graph.nodes.set(p.to_node, {coordinates: coordinates.at(-1), name: 'Campus junction'});
    const e = {...p, id: p.segment_id, coordinates, meters: pathLength(coordinates)};
    graph.edges.push(e); graph.assets.set(e.id, e);
  }
  const records = [...(data.status || [])].sort((a, b) => Date.parse(a.reported_at) - Date.parse(b.reported_at));
  for (const row of records) {
    const target = graph.assets.get(row.asset_id), at = Date.parse(row.reported_at), until = row.expected_end ? Date.parse(row.expected_end) : null;
    let result = 'applied';
    if (!target) result = 'unknown asset';
    else if (!Number.isFinite(at) || (row.expected_end && !Number.isFinite(until))) result = 'invalid date';
    else if (at > +now) result = 'scheduled';
    else if (until !== null && until <= +now) result = 'expired';
    else if (!['available', 'closed', 'unknown'].includes(row.status)) result = 'invalid status';
    if (target && result === 'expired') target.operational_status = 'unknown';
    if (result === 'applied') { target.operational_status = row.status; target.status_source = row.source; target.reported_at = row.reported_at; }
    graph.statusLog.push({...row, result});
  }
  for (const id of closedAssets) { const a = graph.assets.get(id); if (a) { a.operational_status = 'closed'; a.simulated = true; } }
  if (!enableClosures) for (const a of graph.assets.values()) {
    if (a.operational_status === 'closed') a.operational_status = 'unknown';
    delete a.simulated;
  }
  // One coordinate per graph node prevents visual jumps between incident paths.
  if (data.studentRoutes) for (const e of graph.edges) {
    e.coordinates = e.coordinates.map(p => [...p]);
    e.coordinates[0] = graph.nodes.get(e.from_node).coordinates;
    e.coordinates[e.coordinates.length - 1] = graph.nodes.get(e.to_node).coordinates;
    e.meters = pathLength(e.coordinates);
  }
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
function unavailable(asset) {
  if (asset.operational_status === 'closed') return 'closed';
  return null;
}
function blockingReason(graph, edge) {
  for (const n of [edge.from, edge.to]) { const ent = graph.entrances.get(n); if (ent) { const why = unavailable(ent); if (why) return why; } }
  if (edge.kind === 'virtual') {
    if (edge.from.startsWith('B:') && graph.entrances.get(edge.to)?.door_use === 'entry') return 'entrance only';
    if (edge.to.startsWith('B:') && graph.entrances.get(edge.from)?.door_use === 'exit') return 'exit only';
    return null;
  }
  if (['restricted', 'swipe_required'].includes(edge.access_control)) return 'restricted access';
  return unavailable(edge);
}
export function findRoute(graph, from, to) {
  const start = resolvePlace(graph, from), end = resolvePlace(graph, to);
  if (!start || !end) return {found: false, reason: 'Choose a starting point and destination from the pilot area.', legs: []};
  if (start.node === end.node) return {found: true, samePlace: true, legs: [], meters: 0, seconds: 0, start, end};
  const distances = new Map([[start.node, 0]]), previous = new Map(), pending = new Set([start.node]), visited = new Set();
  while (pending.size) {
    const current = [...pending].reduce((a, b) => distances.get(a) <= distances.get(b) ? a : b);
    pending.delete(current); if (current === end.node) break; visited.add(current);
    for (const e of graph.adj.get(current) || []) {
      if (visited.has(e.to) || (e.to.startsWith('B:') && e.to !== end.node) || blockingReason(graph, e)) continue;
      const candidate = distances.get(current) + e.meters;
      if (candidate < (distances.get(e.to) ?? Infinity)) { distances.set(e.to, candidate); previous.set(e.to, e); pending.add(e.to); }
    }
  }
  if (!distances.has(end.node)) return {found: false, start, end, legs: [], reason: 'No connected route is mapped between these places. A closure or restricted entrance may block the way.'};
  const allLegs = []; let current = end.node;
  while (current !== start.node) { const edge = previous.get(current); allLegs.unshift(edge); current = edge.from; }
  const sameEntrance = allLegs.length > 0 && allLegs.every(e => e.kind === 'virtual');
  if (sameEntrance) {
    return {found: true, sameEntrance: true, legs: [], meters: null, seconds: null, start, end, startEntrance: graph.entrances.get(allLegs[0].to), endEntrance: graph.entrances.get(allLegs.at(-1).from)};
  }
  const legs = allLegs.filter(e => e.kind !== 'virtual').map(e => ({...e, seconds: e.meters / 1.15}));
  const meters = legs.reduce((sum, e) => sum + e.meters, 0);
  return {found: true, start, end, legs, meters, seconds: legs.reduce((sum, e) => sum + e.seconds, 0), startEntrance: allLegs[0]?.kind === 'virtual' ? graph.entrances.get(allLegs[0].to) : graph.entrances.get(start.node), endEntrance: allLegs.at(-1)?.kind === 'virtual' ? graph.entrances.get(allLegs.at(-1).from) : graph.entrances.get(end.node)};
}
