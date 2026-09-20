import {haversine, pathLength} from './router.mjs';

export const STORAGE_KEY='accesspath_network_edits_v1';
export const clone=value=>JSON.parse(JSON.stringify(value));
export const emptyEdits=()=>({version:1,paths:{},entrances:{},studentLegs:{},nodes:{}});
export function readEdits(storage=globalThis.localStorage){
  const text=storage.getItem(STORAGE_KEY);
  if(!text)return emptyEdits();
  return validateEdits(JSON.parse(text));
}
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=-180&&p[0]<=180&&p[1]>=-90&&p[1]<=90;
export function validateEdits(edits){
  if(!edits || edits.version!==1)throw Error('This is not an AccessPath editor file.');
  for(const key of ['paths','entrances','studentLegs','nodes'])if(!edits[key]||typeof edits[key]!=='object'||Array.isArray(edits[key]))throw Error('Missing editor section: '+key);
  for(const [id,f] of Object.entries(edits.paths))if(f){
    if(f.properties?.segment_id!==id||!f.properties.from_node||!f.properties.to_node||f.geometry?.type!=='LineString'||f.geometry.coordinates.length<2||!f.geometry.coordinates.every(validPoint))throw Error('Invalid path: '+id);
  }
  for(const [id,f] of Object.entries(edits.entrances))if(f && (f.properties?.entrance_id!==id||!f.properties.node_id||!f.properties.building_id||!validPoint(f.geometry?.coordinates)))throw Error('Invalid entrance: '+id);
  for(const [id,leg] of Object.entries(edits.studentLegs))if(leg&&(!Array.isArray(leg.coordinates)||leg.coordinates.length<2||!leg.coordinates.every(validPoint)))throw Error('Invalid screenshot path: '+id);
  for(const p of Object.values(edits.nodes))if(!validPoint(p))throw Error('Invalid junction coordinate.');
  return edits;
}
export function saveEdits(edits,storage=globalThis.localStorage){
  validateEdits(edits);storage.setItem(STORAGE_KEY,JSON.stringify(edits));
}
function mergeFeatures(features,changes,key){
  const byId=new Map(features.map(f=>[f.properties[key],clone(f)]));
  for(const [id,f] of Object.entries(changes))f?byId.set(id,clone(f)):byId.delete(id);
  return [...byId.values()];
}
export function applyEdits(source,edits=emptyEdits()){
  validateEdits(edits);const data=clone(source);
  data.paths.features=mergeFeatures(data.paths.features,edits.paths,'segment_id');
  data.entrances.features=mergeFeatures(data.entrances.features,edits.entrances,'entrance_id');
  for(const f of data.paths.features){
    const p=f.properties,c=f.geometry.coordinates;
    if(edits.nodes[p.from_node])c[0]=clone(edits.nodes[p.from_node]);
    if(edits.nodes[p.to_node])c[c.length-1]=clone(edits.nodes[p.to_node]);
  }
  for(const f of data.entrances.features){
    const node=f.properties.node_id;
    if(edits.nodes[node])f.geometry.coordinates=clone(edits.nodes[node]);
  }
  return data;
}
export function moveNode(edits,node,point){edits.nodes[node]=clone(point);}
export function nextId(prefix,existing){let n=1;while(existing.has(prefix+n))n++;return prefix+n;}
export function makePath(id,from,to,coordinates,properties={}){
  if(coordinates.length<2||(from===to&&pathLength(coordinates)<0.1))throw Error('Draw at least two different points.');
  return {type:'Feature',geometry:{type:'LineString',coordinates:clone(coordinates)},properties:{segment_id:id,from_node:from,to_node:to,name:'Edited campus path',operational_status:'unknown',is_indoor:false,surface:'unknown',access_control:'outdoor',open_hours:'unknown',source:'AccessPath route editor',...properties}};
}
export function projectPoint(point,line){
  let best;
  for(let i=0;i<line.length-1;i++){
    const a=line[i],b=line[i+1],sx=Math.cos(point[1]*Math.PI/180),dx=(b[0]-a[0])*sx,dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,(((point[0]-a[0])*sx)*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
    const coordinates=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],meters=haversine(point,coordinates);
    if(!best||meters<best.meters)best={coordinates,index:i,t,meters};
  }return best;
}
export function splitPath(feature,point,nodeId,newId){
  const c=feature.geometry.coordinates,p=projectPoint(point,c);
  if(haversine(p.coordinates,c[0])<0.5)return {node:feature.properties.from_node,point:c[0],features:[]};
  if(haversine(p.coordinates,c.at(-1))<0.5)return {node:feature.properties.to_node,point:c.at(-1),features:[]};
  const left=clone(feature),right=clone(feature);
  left.geometry.coordinates=[...c.slice(0,p.index+1),p.coordinates];left.properties.to_node=nodeId;
  right.geometry.coordinates=[p.coordinates,...c.slice(p.index+1)];right.properties.from_node=nodeId;right.properties.segment_id=newId;
  return {node:nodeId,point:p.coordinates,features:[left,right]};
}

export async function loadDataset(){
  const files={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',pois:'pois.geojson',metadata:'metadata.json',status:'status-records.json',floorplans:'floorplans.json'};
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async([key,file])=>{const r=await fetch('data/'+file,{cache:'no-store'});if(!r.ok)throw Error('Could not load '+file);return[key,await r.json()];})));
}
