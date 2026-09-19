// Rebuild the screenshot corridors using the saved VT sidewalk geometry.
// Hand-marked indoor passages stay separate and retain unknown accessibility.
import fs from 'node:fs';
import {haversine} from '../dist/router.mjs';
const root=new URL('../',import.meta.url);
const raw=JSON.parse(fs.readFileSync(new URL('source-data/vt-sidewalks-2026-09-19.geojson',root),'utf8'));
const coords=[],adj=[],keyMap=new Map();
function node(p){const key=p.map(v=>v.toFixed(6)).join(',');if(keyMap.has(key))return keyMap.get(key);const id=coords.length;keyMap.set(key,id);coords.push(p.slice(0,2));adj.push([]);return id;}
function link(a,b,source){const meters=haversine(coords[a],coords[b]);adj[a].push({to:b,meters,source});adj[b].push({to:a,meters,source});}
for(const f of raw.features){const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;for(const line of lines)for(let i=1;i<line.length;i++)link(node(line[i-1]),node(line[i]),f.properties.objectid);}
// GIS polylines also meet at T junctions in the middle of other segments.
// Node those junctions before routing; do not bridge road-width gaps.
const originalCount=coords.length;
const segments=adj.flatMap((edges,a)=>edges.filter(e=>a<e.to).map(e=>({a,b:e.to,source:e.source})));
for(const {a,b,source} of segments){
 const u=coords[a],v=coords[b],sx=Math.cos(u[1]*Math.PI/180),dx=(v[0]-u[0])*sx,dy=v[1]-u[1],splits=[{id:a,t:0},{id:b,t:1}];
 for(let id=0;id<originalCount;id++){
  if(id===a||id===b)continue;const p=coords[id];
  const t=(((p[0]-u[0])*sx)*dx+(p[1]-u[1])*dy)/(dx*dx+dy*dy||1);
  if(t<0||t>1)continue;
  const q=[u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t];
  if(haversine(p,q)<0.7)splits.push({id,t});
 }
 if(splits.length>2){adj[a]=adj[a].filter(e=>e.to!==b);adj[b]=adj[b].filter(e=>e.to!==a);splits.sort((x,y)=>x.t-y.t);for(let i=1;i<splits.length;i++)link(splits[i-1].id,splits[i].id,source);}
}
// Snap a waypoint onto its nearest sidewalk segment, splitting that segment.
function snap(p){let best;const sx=Math.cos(p[1]*Math.PI/180);for(let a=0;a<coords.length;a++)for(const e of adj[a]){if(a>=e.to)continue;const u=coords[a],v=coords[e.to],dx=(v[0]-u[0])*sx,dy=v[1]-u[1],t=Math.max(0,Math.min(1,(((p[0]-u[0])*sx)*dx+(p[1]-u[1])*dy)/(dx*dx+dy*dy||1)));const q=[u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t],distance=haversine(p,q);if(!best||distance<best.distance)best={a,b:e.to,q,distance,source:e.source};}if(best.distance>30)throw Error('Waypoint too far from a sidewalk: '+p+' ('+best.distance+' m)');const n=node(best.q);if(n!==best.a&&n!==best.b){adj[best.a]=adj[best.a].filter(e=>e.to!==best.b);adj[best.b]=adj[best.b].filter(e=>e.to!==best.a);link(best.a,n,best.source);link(n,best.b,best.source);}return n;}
function shortest(a,b){const dist=new Map([[a,0]]),prev=new Map(),q=new Set([a]),seen=new Set();while(q.size){const u=[...q].reduce((a,b)=>dist.get(a)<=dist.get(b)?a:b);q.delete(u);if(u===b)break;seen.add(u);for(const e of adj[u])if(!seen.has(e.to)&&dist.get(u)+e.meters<(dist.get(e.to)??Infinity)){dist.set(e.to,dist.get(u)+e.meters);prev.set(e.to,{from:u,source:e.source});q.add(e.to);}}if(!dist.has(b))return null;const ids=[b],sources=[];while(ids[0]!==a){const x=prev.get(ids[0]);sources.unshift(x.source);ids.unshift(x.from);}return {coordinates:ids.map(i=>coords[i]),sources:[...new Set(sources)]};}
const anchors={
 perry:[-80.42590,37.22930],derringNW:[-80.42589,37.22917],derringSE:[-80.42559,37.22888],pamplin:[-80.42501,37.22873],
 hittNW:[-80.42624,37.22951],ncbNorth:[-80.42665,37.22950],ncbSouth:[-80.42681,37.22922],davidson:[-80.42491,37.22716],
 williams:[-80.42473,37.22773],goodwin:[-80.42564,37.23214],dds1:[-80.42777,37.23166],dds2:[-80.42721,37.23148],
 orangeSouth:[-80.42653,37.22966],orangeEast:[-80.42618,37.23013],orangeNorth:[-80.42616,37.23049],
 transitSouth:[-80.42596,37.23044],transitNorth:[-80.42651,37.23070],ddsApproach:[-80.42738,37.23131],
 maroonSouth:[-80.42537,37.23031],maroonWest:[-80.42532,37.23089],maroonNorth:[-80.42550,37.23125],
 goodwinExit:[-80.42632,37.23220],pricesGoodwin:[-80.42657,37.23247],pricesDDS:[-80.42740,37.23199]
};
const ids=Object.fromEntries(Object.entries(anchors).map(([k,p])=>[k,snap(p)]));
const A=k=>coords[ids[k]];
const legs={};
function walk(id,name,via){
 const loop=['MAROON-TRANSIT','HITT-ORANGE','TRANSIT-DDS','ORANGE-CONNECTOR','MAROON-CONNECTOR'].includes(id);
 const route=[],sources=new Set();
 for(let i=1;i<via.length;i++){
  const a=typeof via[i-1]==='string'?ids[via[i-1]]:snap(via[i-1]);
  const b=typeof via[i]==='string'?ids[via[i]]:snap(via[i]);
  let part=loop?shortest(a,b):null;
  if(!part){if(loop)throw Error('Loop sidewalk disconnected: '+id);part={coordinates:[coords[a],coords[b]],sources:['user-traced-link']};}
  route.push(...part.coordinates.slice(i===1?0:1));part.sources.forEach(s=>sources.add(s));
 }
 legs[id]={id,name,is_indoor:false,coordinates:route,source:loop?'VT sidewalk geometry; perimeter selected from user screenshot':'User screenshot: approximate traced bends, anchored to nearby VT sidewalk points',source_feature_ids:[...sources]};return id;
}
function indoor(id,name,from,via,to,building='VT-DERRING'){legs[id]={id,name,is_indoor:true,building,coordinates:[A(from),...via,A(to)],source:'User screenshot: approximate indoor passage; access unknown'};return id;}
walk('PERRY-DOOR','Leave Perry Place toward Derring',['perry','derringNW']);
indoor('DERRING-CROSS','Through Derring Hall','derringNW',[[-80.42579,37.22909],[-80.42568,37.22899]],'derringSE');
walk('DERRING-PAMPLIN','Derring exit to Pamplin entrance',['derringSE',[-80.42540,37.22883],[-80.42517,37.22900],'pamplin']);
indoor('HITT-CROSS','Through Hitt Hall','perry',[[-80.42604,37.22945],[-80.42612,37.22958]],'hittNW','VT-HITT');
walk('HITT-NCB','Hitt exit to the NCB entrance',['hittNW',[-80.42647,37.22962],'ncbNorth']);
walk('DAVIDSON-HAHN','Davidson to the walkway behind Hahn South',['davidson',[-80.42489,37.22735],[-80.42527,37.22774],[-80.42549,37.22766],[-80.42562,37.22791],[-80.42580,37.22810]]);
walk('HAHN-NCB','Along Hahn North and Derring to NCB',[[-80.42580,37.22810],[-80.42603,37.22848],[-80.42628,37.22879],[-80.42665,37.22904],'ncbSouth']);
walk('DAVIDSON-WILLIAMS','Davidson to the Williams-side walkway',['davidson',[-80.42465,37.22737],[-80.42487,37.22760],'williams']);
walk('WILLIAMS-PAMPLIN','Past Williams toward Pamplin',['williams',[-80.42445,37.22800],[-80.42469,37.22817],[-80.42503,37.22824],[-80.42521,37.22845],'pamplin']);
walk('DERRING-MAROON','Derring toward Cowgill and the Maroon Loop sidewalk',['derringNW',[-80.42517,37.22972],[-80.42525,37.22987],'maroonSouth']);
walk('MAROON-TRANSIT','Follow the Maroon Loop perimeter sidewalk',['maroonSouth','transitSouth']);
walk('HITT-ORANGE','Hitt to the Orange Loop sidewalk',['hittNW','orangeSouth','orangeEast','orangeNorth','transitSouth']);
walk('TRANSIT-DDS','Transit Center sidewalk toward DDS',['transitSouth','transitNorth','ddsApproach']);
walk('DDS-FIRST','Arrive at DDS — Floor 1',['ddsApproach',[-80.42766,37.23153],'dds1']);
walk('DDS-SECOND','Arrive at DDS — Floor 2',['ddsApproach','dds2']);
indoor('GOODWIN-EXIT','Goodwin Hall passage','goodwin',[],'goodwinExit','VT-GOODWIN');
walk('GOODWIN-PRICES','Goodwin / Prices Fork sidewalk',['goodwinExit','pricesGoodwin']);
walk('PRICES-FIRST','Prices Fork sidewalk to DDS — Floor 1',['pricesGoodwin','pricesDDS','dds1']);
walk('PRICES-SECOND','Prices Fork sidewalk to DDS — Floor 2',['pricesGoodwin',[-80.42642,37.23213],[-80.42640,37.231995],[-80.42685,37.23166],'dds2']);
walk('PERRY-OUTSIDE','Outdoor sidewalk around Derring',['perry','hittNW',[-80.42650,37.22919],[-80.42671,37.22890],[-80.42600,37.22854],[-80.42543,37.22878],'pamplin']);
walk('PAMPLIN-NCB-OUTSIDE','Outdoor sidewalk around Derring to NCB',['pamplin',[-80.42543,37.22878],[-80.42600,37.22854],[-80.42671,37.22890],'ncbNorth']);
walk('DAVIDSON-NCB-OUTSIDE','West Campus Drive sidewalk to NCB',['davidson',[-80.42515,37.22670],[-80.42593,37.22736],[-80.42658,37.22831],[-80.42698,37.22898],'ncbSouth']);
const rev=id=>'-'+id;
const routes=[
 {id:'perry-pamplin',from:['POI-PERRY-PLACE','VT-HITT'],to:['VT-PAMPLIN','POI-PAMPLIN-DEAN'],source_image:'IMG_3109.jpg',color:'red',legs:['PERRY-DOOR','DERRING-CROSS','DERRING-PAMPLIN'],outdoor:['PERRY-OUTSIDE']},
 {id:'pamplin-ncb',from:['VT-PAMPLIN','POI-PAMPLIN-DEAN'],to:['VT-NCB'],source_image:'IMG_3110.jpg',color:'red',legs:[rev('DERRING-PAMPLIN'),rev('DERRING-CROSS'),rev('PERRY-DOOR'),'HITT-CROSS','HITT-NCB'],outdoor:['PAMPLIN-NCB-OUTSIDE']},
 {id:'davidson-ncb',from:['VT-DAVIDSON'],to:['VT-NCB'],source_image:'Screenshot 2026-09-19 at 10.48.54.png',color:'red',legs:['DAVIDSON-HAHN','HAHN-NCB'],outdoor:['DAVIDSON-NCB-OUTSIDE']},
 {id:'goodwin-dds-1',from:['VT-GOODWIN'],to:['VT-DDS','VT-DDS-F1'],source_image:'IMG_3111.jpg',color:'red',floor:'1',legs:['GOODWIN-EXIT','GOODWIN-PRICES','PRICES-FIRST']},
 {id:'goodwin-dds-2',from:['VT-GOODWIN'],to:['VT-DDS-F2'],source_image:'IMG_3111.jpg',color:'yellow',floor:'2',legs:['GOODWIN-EXIT','GOODWIN-PRICES','PRICES-SECOND']},
 {id:'davidson-dds-1',from:['VT-DAVIDSON'],to:['VT-DDS','VT-DDS-F1'],source_image:'IMG_3113.jpg',color:'red',floor:'1',legs:['DAVIDSON-WILLIAMS','WILLIAMS-PAMPLIN',rev('DERRING-PAMPLIN'),rev('DERRING-CROSS'),'DERRING-MAROON','MAROON-TRANSIT','TRANSIT-DDS','DDS-FIRST']},
 {id:'davidson-dds-2',from:['VT-DAVIDSON'],to:['VT-DDS-F2'],source_image:'IMG_3113.jpg',color:'yellow',floor:'2',legs:['DAVIDSON-WILLIAMS','WILLIAMS-PAMPLIN',rev('DERRING-PAMPLIN'),rev('DERRING-CROSS'),rev('PERRY-DOOR'),'HITT-CROSS','HITT-ORANGE','TRANSIT-DDS','DDS-SECOND']}
];
walk('ORANGE-CONNECTOR','Orange Loop perimeter sidewalk',[[-80.42727,37.23163],'ddsApproach','transitNorth','transitSouth','orangeNorth','orangeEast','orangeSouth','hittNW','perry']);
walk('MAROON-CONNECTOR','Maroon Loop perimeter sidewalk',[[-80.42588,37.22994],'maroonSouth','maroonWest','maroonNorth',[-80.42462,37.232055]]);
// Corridor labels remain correct when walking the same trace in reverse.
const labels={'PERRY-DOOR':'Perry Place / Derring approach','DERRING-PAMPLIN':'Derring / Pamplin entrance walkway','HITT-NCB':'Hitt / NCB entrance walkway','DAVIDSON-HAHN':'Davidson / Hahn South walkway','HAHN-NCB':'Hahn North / NCB walkway','DAVIDSON-WILLIAMS':'Davidson / Williams walkway','WILLIAMS-PAMPLIN':'Williams / Pamplin walkway','DERRING-MAROON':'Derring / Cowgill / Maroon sidewalk','HITT-ORANGE':'Hitt / Orange Loop sidewalk','TRANSIT-DDS':'Transit Center / DDS sidewalk','DDS-FIRST':'DDS floor 1 entrance approach','DDS-SECOND':'DDS floor 2 entrance approach','PRICES-FIRST':'Prices Fork / DDS floor 1 walkway','PRICES-SECOND':'Prices Fork / DDS floor 2 walkway'};
for(const [id,name] of Object.entries(labels))legs[id].name=name;
const output={version:1,source:'User-annotated screenshots, 2026-09-19; outdoor corridors traced on VT ADA_Routes_Only geometry. Geometry alignment is approximate; no accessibility claims imported.',closures_enabled:false,anchors:Object.fromEntries(Object.keys(ids).map(k=>[k,A(k)])),legs,routes,
 entranceCoordinates:{'N-HITT-E1':A('perry'),'N-DERRING-EN':A('derringNW'),'N-DERRING-EE':A('derringSE'),'N-PAMPLIN-EW':A('pamplin'),'N-DAVIDSON-E1':A('davidson'),'N-GOODWIN-E1':A('goodwin'),'N-DDS-E1':A('dds1'),'N-DDS-E2':A('dds2')},
 edgeOverrides:{'SEG-024':legs['ORANGE-CONNECTOR'].coordinates,'SEG-025':legs['MAROON-CONNECTOR'].coordinates}
};
fs.writeFileSync(new URL('dist/data/student-routes.json',root),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({routes:routes.length,legs:Object.keys(legs).length,anchors:output.anchors},null,2));
