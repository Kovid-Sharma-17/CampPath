import {buildGraph,findRoute,resolvePlace,haversine,pathLength} from './router.mjs';
import {clone,emptyEdits,readEdits,saveEdits,validateEdits,applyEdits,makePath,nextId,projectPoint,splitPath,markStairSpan,loadDataset,moveNode} from './editor-model.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=p=>p.route_name||p.name||p.segment_id;
const ll=p=>[p[1],p[0]],point=e=>[e.latlng.lng,e.latlng.lat];
let source,data,graph,edits,map,baseLayer,draftLayer,alternateLayer,queryLayer,draft=null,mode='select',selectedPoint=null,stairFirst=null,stairs=null,door=null;
const history=[];
function status(message){$('#editor-status').textContent=message;}
function attempt(fn){try{fn();}catch(e){status(e.message);}}
function rebuild(){data=applyEdits(source,edits);graph=buildGraph(data,{enableClosures:false});renderNetwork();populate();}
function commit(next,message){validateEdits(next);saveEdits(next);history.push(clone(edits));edits=next;$('#undo-edit').disabled=false;rebuild();status(message);}
function ids(){return new Set(data.paths.features.map(f=>f.properties.segment_id));}
function currentFeature(id){return data.paths.features.find(f=>f.properties.segment_id===id);}
function physicalFeature(f){const out=clone(f),edge=graph.edges.find(e=>e.id===f.properties.segment_id);if(edge)out.geometry.coordinates=clone(edge.coordinates);return out;}
function reset(){draft=null;door=null;mode='select';selectedPoint=null;stairFirst=null;draftLayer.clearLayers();alternateLayer.clearLayers();$('#path-panel').hidden=true;$('#entrance-panel').hidden=true;$('#finish-draw').hidden=true;status('Click a path to edit it, or choose New path.');}
function populate(){
 const query=$('#path-search').value.toLowerCase();
 const paths=data.paths.features.filter(f=>[f.properties.route_name,f.properties.name,f.properties.segment_id,f.properties.from_node,f.properties.to_node].join(' ').toLowerCase().includes(query));
 $('#path-list').innerHTML='<option value="">Choose a path…</option>'+paths.slice(0,500).map(f=>'<option value="'+esc(f.properties.segment_id)+'" title="'+esc(f.properties.segment_id)+'">'+esc(label(f.properties))+'</option>').join('');
 const buildings=[...graph.buildings.values()].sort((a,b)=>a.name.localeCompare(b.name));
 const options=buildings.map(b=>'<option value="'+esc(b.building_id)+'">'+esc(b.name)+'</option>').join('');
 const selected=$('#entrance-building').value;$('#entrance-building').innerHTML=options;if(selected)$('#entrance-building').value=selected;
 $('#building-jump').innerHTML='<option value="">Zoom to a building…</option>'+buildings.filter(b=>b.name.toLowerCase().includes(query)).map(b=>'<option value="'+esc(b.building_id)+'">'+esc(b.name)+'</option>').join('');
 $('#network-count').textContent=data.paths.features.length.toLocaleString()+' mapped segments · '+graph.buildings.size+' buildings';
}
function renderNetwork(){
  baseLayer.clearLayers();
  for(const f of data.barriers?.features||[]){
   const p=f.properties,isLine=f.geometry.type==='LineString',centerCoord=isLine?f.geometry.coordinates[Math.floor(f.geometry.coordinates.length/2)]:f.geometry.coordinates;
   const layer=isLine?L.polyline(f.geometry.coordinates.map(ll),{color:'#c54231',weight:5,opacity:.9,bubblingMouseEvents:false}):L.circleMarker(ll(f.geometry.coordinates),{radius:10,color:'#fff',weight:2,fillColor:'#c54231',fillOpacity:1});
   layer.addTo(baseLayer).bindTooltip(esc(p.name)+' · not yet split into a routable stair segment');
   layer.on('click',e=>{L.DomEvent.stopPropagation(e);map.setView(ll(centerCoord),19);status(p.notes);});
  }
 for(const e of graph.edges){
  const stairs=e.has_recorded_stairs||['stairs','not_step_free'].includes(e.accessibility_status),student=!/^(VT-WALK-|OSM-)/.test(e.id);
  const line=L.polyline(e.coordinates.map(ll),{color:stairs?'#c54231':student?'#b77624':'#5d8171',weight:student?3:2,opacity:.78,bubblingMouseEvents:false});
  line.bindTooltip(esc(label(e))+' · '+esc(e.accessibility_status||'unknown'));
  line.on('click',ev=>{L.DomEvent.stopPropagation(ev);if(mode==='draw'){addDrawPoint(point(ev));return;}if(mode==='entrance'){placeDoor(point(ev));return;}const f=currentFeature(e.id);if(f)selectPath(f);});line.addTo(baseLayer);
 }
 for(const f of data.entrances.features){
  const p=f.properties,coord=graph.entrances.get(p.node_id)?.coordinates||f.geometry.coordinates,approach=p.node_role==='approach';
  const marker=L.circleMarker(ll(coord),{radius:approach?4:6,color:approach?'#687b84':'#fff',weight:2,fillColor:approach?'#fff':'#245cbb',fillOpacity:1,bubblingMouseEvents:false}).addTo(baseLayer);
  marker.bindTooltip(esc(graph.buildings.get(p.building_id)?.name)+' · '+esc(p.entrance_name));
  marker.on('click',ev=>{L.DomEvent.stopPropagation(ev);if(mode==='draw')addDrawPoint(coord);else if(mode==='entrance')placeDoor(coord);else editDoor(f,coord);});
 }
}
function selectPath(feature){
 reset();draft=physicalFeature(feature);mode='edit';$('#path-panel').hidden=false;$('#delete-path').hidden=false;$('#path-heading').textContent='Edit '+label(feature.properties);$('#path-list').value=feature.properties.segment_id;
 fillFields();renderDraft();status('Drag a point, click the line to insert one, or select a point to remove it.');
 if(draft.properties.accessibility_status==='stairs'){stairs={from:draft.properties.from_node,to:draft.properties.to_node,coordinates:[draft.geometry.coordinates[0],draft.geometry.coordinates.at(-1)],id:draft.properties.segment_id};$('#stair-actions').hidden=false;}
}
function fillFields(){const p=draft.properties;$('#path-name').value=p.name||p.route_name||p.segment_id;$('#path-access').value=p.accessibility_status||'unknown';$('#path-confidence').value=p.confidence||'inferred';$('#path-indoor').checked=!!p.is_indoor;$('#path-notes').value=p.notes||'';$('#path-source').textContent=p.source||'Existing campus dataset';$('#stair-actions').hidden=true;$('#alternate-status').textContent='';}
function captureFields(){const p=draft.properties;p.name=$('#path-name').value.trim()||'Campus path';p.accessibility_status=$('#path-access').value;p.confidence=$('#path-confidence').value;p.is_indoor=$('#path-indoor').checked;p.access_control=p.is_indoor?'indoor':'outdoor';p.notes=$('#path-notes').value.trim();}
function renderDraft(){
 draftLayer.clearLayers();if(!draft)return;const c=draft.geometry.coordinates;
 if(c.length>1){const line=L.polyline(c.map(ll),{color:'#cf4837',weight:6,bubblingMouseEvents:false}).addTo(draftLayer);line.on('click',e=>{L.DomEvent.stopPropagation(e);if(mode==='draw'){addDrawPoint(point(e));return;}if(mode==='stairs')return;const near=projectPoint(point(e),c);c.splice(near.index+1,0,near.coordinates);selectedPoint=near.index+1;renderDraft();});}
 c.forEach((p,i)=>{
  const marker=L.marker(ll(p),{draggable:mode!=='stairs',icon:L.divIcon({className:'vertex-dot'+(i===selectedPoint?' selected':''),iconSize:[15,15],iconAnchor:[7,7]}),bubblingMouseEvents:false}).addTo(draftLayer);
  marker.bindTooltip('Point '+(i+1)+(i===0?' · start':i===c.length-1?' · end':''));
  marker.on('dragend',e=>{c[i]=[e.target.getLatLng().lng,e.target.getLatLng().lat];selectedPoint=i;renderDraft();});
  marker.on('click',e=>{L.DomEvent.stopPropagation(e);if(mode==='stairs'){chooseStairPoint(i);return;}selectedPoint=i;renderDraft();});
 });
 $('#path-length').textContent=Math.round(pathLength(c))+' m';$('#remove-point').disabled=selectedPoint===null||selectedPoint===0||selectedPoint===c.length-1;$('#save-path').disabled=c.length<2||mode==='draw';
}
function newPath(alternate=null,seed=null){
 reset();const id=nextId('EDIT-',ids());
 const initial=alternate?alternate.coordinates:seed?seed.coordinates:[[-80.42,37.23],[-80.4201,37.23]];
 draft=makePath(id,'pending-a','pending-b',initial,{name:alternate?'Alternative around stairs':(seed?.name||'New campus path')});
 draft.geometry.coordinates=alternate?clone(alternate.coordinates):seed?clone(seed.coordinates):[];draft.alternate=alternate;mode='draw';$('#path-panel').hidden=false;
 $('#path-heading').textContent=alternate?'Draw stair alternative':(seed?'Draw a path connecting '+seed.label:'Draw a new path');
 $('#delete-path').hidden=true;$('#finish-draw').hidden=false;fillFields();renderDraft();
 status(alternate?'Click along the alternative between the two stair endpoints, then Finish drawing.':seed?'Start and end are placed near '+seed.label+'. Click the map to add turns, or Finish drawing to keep it straight.':'Click the start, each turn, and the end. Finish drawing when ready.');
}
function openFromQuery(){
 const params=new URLSearchParams(location.search),fromId=params.get('from'),toId=params.get('to');
 if(!fromId||!toId)return;
 const a=resolvePlace(graph,fromId),b=resolvePlace(graph,toId);
 if(!a||!b){status('Could not find one of the linked places in this dataset.');return;}
 const r=findRoute(graph,fromId,toId,{});
 queryLayer.clearLayers();
 if(r.found&&r.legs.length){
  for(const e of r.legs)L.polyline(e.coordinates.map(ll),{color:'#1d6fd6',weight:7,opacity:.5,bubblingMouseEvents:false}).addTo(queryLayer);
  map.fitBounds(L.latLngBounds(r.legs.flatMap(e=>e.coordinates.map(ll))),{padding:[60,60],maxZoom:19});
  const editable=r.legs.map(e=>currentFeature(e.id)||currentFeature('TRACE-'+e.id)).find(Boolean);
  if(editable)selectPath(editable);
  status('Route from '+a.name+' to '+b.name+': '+r.legs.length+' segment(s), highlighted in blue.'+(editable?' Showing the first editable one — click any highlighted segment to edit it instead.':' None of its segments are directly editable here (it runs through connectors).'));
 }else{
  map.fitBounds(L.latLngBounds([ll(a.coordinates),ll(b.coordinates)]),{padding:[80,80],maxZoom:18});
  newPath(null,{coordinates:[clone(a.coordinates),clone(b.coordinates)],name:a.name+' – '+b.name,label:a.name+' and '+b.name});
  status('No route connects '+a.name+' and '+b.name+' yet. Start and end are placed near them — trace the real path, then Save.');
 }
}
function addDrawPoint(p){if(!draft)return;const c=draft.geometry.coordinates;if(draft.alternate)c.splice(c.length-1,0,p);else c.push(p);renderDraft();}
function snapEndpoint(p,next,excludeNode=null){
 let nearNode;
 for(const [id,n] of graph.nodes){if(id===excludeNode||id.startsWith('B:')||/-L\d+$/.test(id))continue;const coordinates=next.nodes[id]||n.coordinates,meters=haversine(p,coordinates);if(meters<=4&&(!nearNode||meters<nearNode.meters))nearNode={id,coordinates,meters};}
 if(nearNode)return {node:nearNode.id,point:nearNode.coordinates};
 const candidates=new Map(data.paths.features.map(f=>[f.properties.segment_id,physicalFeature(f)]));
 for(const [id,f] of Object.entries(next.paths))f?candidates.set(id,f):candidates.delete(id);
 for(const [id,q] of Object.entries(next.nodes))if(id!==excludeNode&&haversine(p,q)<.5)return {node:id,point:q};
 let hit;for(const current of candidates.values()){if(current.properties.is_indoor)continue;const q=projectPoint(p,current.geometry.coordinates);if(q.meters<=5&&(!hit||q.meters<hit.q.meters))hit={feature:current,q};}
 const used=new Set([...graph.nodes.keys(),...Object.keys(next.nodes)]),id=nextId('J-EDIT-',used);
 if(hit){const split=splitPath(hit.feature,p,id,nextId('EDIT-SPLIT-',new Set([...ids(),...Object.keys(next.paths)])));for(const f of split.features)next.paths[f.properties.segment_id]=f;next.nodes[split.node]=clone(split.point);return split;}
 next.nodes[id]=clone(p);return {node:id,point:p};
}
function savePath(){
 captureFields();const c=draft.geometry.coordinates;if(c.length<2)throw Error('Draw at least two points.');if(draft.alternate&&c.length<3)throw Error('Trace the alternative before saving it.');
 const next=clone(edits),f=clone(draft);delete f.alternate;
 if(draft.properties.from_node==='pending-a'){
  if(draft.alternate){f.properties.from_node=draft.alternate.from;f.properties.to_node=draft.alternate.to;f.properties.alternative_for=draft.alternate.id;}
  else{const a=snapEndpoint(c[0],next),b=snapEndpoint(c.at(-1),next);f.properties.from_node=a.node;f.properties.to_node=b.node;f.geometry.coordinates[0]=clone(a.point);f.geometry.coordinates[f.geometry.coordinates.length-1]=clone(b.point);}
 }else{for(const [id,p] of [[f.properties.from_node,c[0]],[f.properties.to_node,c.at(-1)]])if(haversine(graph.nodes.get(id).coordinates,p)>.01)moveNode(next,id,p);}
 next.paths[f.properties.segment_id]=f;commit(next,'Path saved. The route planner now uses this edit.');draft=clone(f);mode='edit';$('#delete-path').hidden=false;$('#finish-draw').hidden=true;renderDraft();
}
function chooseStairPoint(i){
 if(stairFirst===null){stairFirst=i;selectedPoint=i;renderDraft();status('Now click the last point of the stair section.');return;}
 attempt(()=>{const result=markStairSpan(draft,stairFirst,i,nextId('STAIR-',new Set(data.paths.features.map(f=>f.properties.segment_id.replace(/-(before|stairs|after)$/,'')))));const next=clone(edits);next.paths[draft.properties.segment_id]=null;for(const f of result.features)next.paths[f.properties.segment_id]=f;
 commit(next,'Stair section saved. Find or draw an alternative for this section.');const stair=result.features.find(f=>f.properties.accessibility_status==='stairs');selectPath(currentFeature(stair.properties.segment_id));$('#stair-actions').hidden=false;mode='edit';stairFirst=null;});
}
function findAlternate(){
 if(!stairs)return;const g=buildGraph(data,{enableClosures:false});g.places.push({id:'STAIR-START',node:stairs.from,name:'Stair start'},{id:'STAIR-END',node:stairs.to,name:'Stair end'});
 const r=findRoute(g,'STAIR-START','STAIR-END',{avoidStairs:true});alternateLayer.clearLayers();
 if(!r.found){$('#alternate-status').textContent='No connected alternative is mapped. Draw the ramp or elevator route if you know it.';return;}
 for(const e of r.legs)L.polyline(e.coordinates.map(ll),{color:'#6454bb',weight:6,dashArray:'6 6'}).addTo(alternateLayer);
 $('#alternate-status').textContent='Mapped stairs-avoiding alternative: '+Math.round(r.meters)+' m. Accessibility remains unverified.';
}
function startEntrance(){reset();mode='entrance';door={coordinates:null,existing:null};$('#entrance-panel').hidden=false;$('#entrance-name').value='Entrance / exit';$('#entrance-floor').value='';$('#entrance-direction').value='both';status('Choose a building and click its door.');}
function editDoor(f,coordinates){startEntrance();door.existing=clone(f);$('#entrance-building').value=f.properties.building_id;$('#entrance-name').value=f.properties.entrance_name;$('#entrance-floor').value=f.properties.entry_floor||'';$('#entrance-direction').value=f.properties.door_use||'both';placeDoor(coordinates);status('Drag the door marker to move it. Choose Save door to keep the change.');}
function placeDoor(p){door.coordinates=p;draftLayer.clearLayers();const marker=L.marker(ll(p),{draggable:true,icon:L.divIcon({className:'door-drag',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(draftLayer);marker.on('dragend',e=>{door.coordinates=[e.target.getLatLng().lng,e.target.getLatLng().lat];});}
function saveDoor(){
 if(!door?.coordinates)throw Error('Click a door position on the map first.');const next=clone(edits),bid=$('#entrance-building').value;
 const id=door.existing?.properties.entrance_id||nextId('DOOR-'+bid+'-',new Set(data.entrances.features.map(f=>f.properties.entrance_id))),node=door.existing?.properties.node_id||'N-'+id;
 const f={type:'Feature',geometry:{type:'Point',coordinates:door.coordinates},properties:{...door.existing?.properties,entrance_id:id,node_id:node,building_id:bid,entrance_name:$('#entrance-name').value.trim()||'Entrance / exit',entry_floor:$('#entrance-floor').value.trim()||null,door_use:$('#entrance-direction').value,node_role:'entrance',accessibility_status:'unknown',operational_status:'unknown',confidence:'community_report',geometry_precision:'user_marked',source:'User-marked entrance in route editor'}};
 next.entrances[id]=f;moveNode(next,node,door.coordinates);let message='Door saved. Draw a path to connect it to the sidewalk.';
 if(!door.existing){const target=snapEndpoint(door.coordinates,next,node);if(haversine(door.coordinates,target.point)<=5&&target.node!==node){const link=makePath(nextId('DOOR-LINK-',new Set([...ids(),...Object.keys(next.paths)])),node,target.node,[door.coordinates,target.point],{name:'Door approach'});next.paths[link.properties.segment_id]=link;message='Door saved and connected to the nearby path.';}}
 commit(next,message);reset();status(message);
}
function wire(){
 $('#new-path').onclick=()=>newPath();$('#new-entrance').onclick=startEntrance;
 $('#path-search').oninput=populate;$('#path-list').onchange=e=>{const f=currentFeature(e.target.value);if(f){selectPath(f);map.fitBounds(L.latLngBounds(f.geometry.coordinates.map(ll)),{padding:[50,50],maxZoom:19});}};
 $('#building-jump').onchange=e=>{const b=graph.buildings.get(e.target.value);if(b){map.setView(ll(b.coordinates),18);$('#entrance-building').value=b.building_id;}};
 $('#remove-point').onclick=()=>{if(selectedPoint>0&&selectedPoint<draft.geometry.coordinates.length-1){draft.geometry.coordinates.splice(selectedPoint,1);selectedPoint=null;renderDraft();}};
 $('#finish-draw').onclick=()=>{if(draft.geometry.coordinates.length<2){status('Choose at least a start and end.');return;}mode='edit';$('#finish-draw').hidden=true;renderDraft();status('Adjust the points or details, then Save path.');};
 $('#save-path').onclick=()=>attempt(savePath);$('#cancel-edit').onclick=reset;$('#cancel-entrance').onclick=reset;$('#save-entrance').onclick=()=>attempt(saveDoor);
 $('#delete-path').onclick=()=>attempt(()=>{const next=clone(edits);next.paths[draft.properties.segment_id]=null;commit(next,'Path deleted. Undo save restores it.');reset();status('Path deleted. Undo save restores it.');});
 $('#mark-stairs').onclick=()=>{if(mode==='draw'||!currentFeature(draft?.properties.segment_id)){status('Save the path before marking a stair section.');return;}mode='stairs';stairFirst=null;status('Click the first point of the stairs. Add points to the line first if needed.');renderDraft();};
 $('#find-alternate').onclick=()=>attempt(findAlternate);$('#draw-alternate').onclick=()=>newPath(stairs);
 $('#undo-edit').onclick=()=>attempt(()=>{const previous=history.at(-1);if(!previous)return;saveEdits(previous);history.pop();edits=previous;reset();rebuild();$('#undo-edit').disabled=!history.length;status('Last save undone.');});
 $('#export-edits').onclick=()=>{const blob=new Blob([JSON.stringify(edits,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='accesspath-network-edits.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Editor backup exported.');};
 $('#import-edits').onclick=()=>$('#import-file').click();$('#import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const incoming=validateEdits(JSON.parse(await file.text()));applyEdits(source,incoming);commit(incoming,'Edits imported. Undo save restores your previous edits.');reset();status('Edits imported and applied to the planner.');}catch(err){status('Import failed: '+err.message);}e.target.value='';};
}
async function load(){
 source=await loadDataset();try{edits=readEdits();}catch(e){edits=emptyEdits();status('Saved edits could not be read: '+e.message);}
 map=L.map('campus-map',{preferCanvas:true}).setView([37.2295,-80.423],16);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Paths: Virginia Tech GIS'}).addTo(map);
 baseLayer=L.layerGroup().addTo(map);draftLayer=L.layerGroup().addTo(map);alternateLayer=L.layerGroup().addTo(map);queryLayer=L.layerGroup().addTo(map);
 map.on('click',e=>{if(mode==='draw')addDrawPoint(point(e));else if(mode==='entrance')placeDoor(point(e));});wire();rebuild();status('Click a preloaded path to edit it. Saved changes also appear in the planner.');
 openFromQuery();
}
load().catch(e=>status('Could not load the editor: '+e.message));
