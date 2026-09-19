// Read-only audit: imports the current planner and does not modify its data.
import {readFileSync} from 'node:fs';
import {buildGraph,compareRoutes,findRoute,haversine} from '../dist/router.mjs';

const names={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',connectors:'connectors.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json'};
const data=Object.fromEntries(Object.entries(names).map(([k,f])=>[k,JSON.parse(readFileSync(new URL('../dist/data/'+f,import.meta.url),'utf8'))]));
const graph=buildGraph(data,{now:new Date('2026-09-19T16:00:00Z')});
const brief=r=>({found:r.found,meters:r.meters,seconds:r.seconds,startEntrance:r.startEntrance?.entrance_id,endEntrance:r.endEntrance?.entrance_id,legs:r.legs.map(e=>({id:e.id,from:e.from,to:e.to,meters:e.meters,indoor:!!e.is_indoor,coordinates:e.coordinates}))});
const pairs=[['Perry Place → Pamplin','POI-PERRY-PLACE','VT-PAMPLIN'],['Pamplin → NCB','VT-PAMPLIN','VT-NCB'],['Davidson → NCB','VT-DAVIDSON','VT-NCB'],['Goodwin → DDS','VT-GOODWIN','VT-DDS'],['Davidson → DDS','VT-DAVIDSON','VT-DDS']];
const routes=pairs.map(([label,from,to])=>{const r=compareRoutes(graph,from,to);return {label,indoor:brief(r.indoor),outdoor:brief(r.outdoor)};});
// Expose existing DDS entrances as diagnostic-only destinations. The public UI
// cannot select these floors. No entrance-floor verification is implied here.
for(const node of ['N-DDS-E1','N-DDS-E2'])graph.places.push({id:'AUDIT-'+node,node,name:node,type:'audit',building:'VT-DDS'});
const ddsPinned=['VT-GOODWIN','VT-DAVIDSON'].map(from=>({from,entrances:['N-DDS-E1','N-DDS-E2'].map(node=>({node,...brief(findRoute(graph,from,'AUDIT-'+node))}))}));
const endpoints=new Map();
for(const e of graph.edges)for(const [node,coord] of [[e.from_node,e.coordinates[0]],[e.to_node,e.coordinates.at(-1)]]){if(!endpoints.has(node))endpoints.set(node,[]);endpoints.get(node).push({edge:e.id,coord});}
const discontinuities=[];
for(const [node,refs] of endpoints){let max=0,pair;for(let i=0;i<refs.length;i++)for(let j=i+1;j<refs.length;j++){const d=haversine(refs[i].coord,refs[j].coord);if(d>max){max=d;pair=[refs[i],refs[j]];}}if(max>2)discontinuities.push({node,maxGapMeters:max,pair});}
const endpointOffsets=[];
for(const [node,refs] of endpoints){const position=graph.nodes.get(node)?.coordinates;if(!position)continue;for(const ref of refs){const meters=haversine(ref.coord,position);if(meters>2)endpointOffsets.push({node,edge:ref.edge,meters});}}
const williams=brief(findRoute(graph,'VT-DAVIDSON','VT-WILLIAMS'));
// Sample against the locally saved, simplified footprint rings. These are a
// diagnostic for obvious straight-line crossings, not a surveyed path boundary.
const ringSource=readFileSync(new URL('./nad_gis_data_20260919.py',import.meta.url),'utf8');
const rings=JSON.parse(ringSource.slice(ringSource.indexOf('RINGS = ')+8).replace(/,\s*}/g,'}'));
function inside(point,ring){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
const footprintCrossings=[];
const selectedIds=new Set(routes.flatMap(r=>r.indoor.legs.map(l=>l.id)));
for(const e of graph.edges.filter(e=>selectedIds.has(e.id)&&!e.is_indoor))for(const [buildingNumber,ring] of Object.entries(rings)){let metersInside=0;for(let i=1;i<e.coordinates.length;i++){const a=e.coordinates[i-1],b=e.coordinates[i],length=haversine(a,b);for(let n=0;n<1000;n++){const t=(n+.5)/1000;if(inside([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],ring))metersInside+=length/1000;}}if(metersInside>5)footprintCrossings.push({edge:e.id,buildingNumber,approximateMetersInside:metersInside});}
console.log(JSON.stringify({auditTime:'2026-09-19T16:00:00Z',routes,ddsPinned,ddsEntrances:data.entrances.features.filter(f=>f.properties.building_id==='VT-DDS'),discontinuities,endpointOffsets,williams,footprintCrossings},null,2));
