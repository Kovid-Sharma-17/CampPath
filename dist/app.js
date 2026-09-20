import {buildGraph, resolvePlace, findRoute, haversine} from './router.mjs';
import {loadDataset,applyEdits,readEdits,STORAGE_KEY} from './editor-model.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {origin:'POI-PERRY-PLACE',destination:'VT-PAMPLIN',view:'routes',planBuilding:'VT-TORGERSEN',planFloor:'01',planZoom:1,gps:null,gpsAccuracy:null};
const GPS_SNAP_METERS = 150;
const GEMINI_MODEL = 'gemini-2.5-flash', ELEVEN_VOICE = '21m00Tcm4TlvDq8ikWAM';
const KEY_STORAGE = {gemini: 'accesspath_key_gemini', elevenlabs: 'accesspath_key_elevenlabs'};
const getKey = name => { try { return localStorage.getItem(KEY_STORAGE[name]) || ''; } catch { return ''; } };
const setKey = (name, value) => { try { value ? localStorage.setItem(KEY_STORAGE[name], value) : localStorage.removeItem(KEY_STORAGE[name]); } catch {} };
let data, graph, route, map, baseLayer, routeLayer, selectedLayer, markersLayer, locationLayer, tilesLoaded = 0;
const latLng = coords => [coords[1], coords[0]];
const duration = r => { const m = Math.max(1, Math.round(r.seconds / 60)); return r.sameEntrance ? 'Unmapped' : r.samePlace ? '0 min' : m + '–' + (m + 2) + ' min'; };
const distance = r => r.sameEntrance?'Shared entrance':Math.round(r.meters) + ' m';
function edgeName(edge) {
  if (edge.name) return edge.name;
  const a = graph.nodes.get(edge.from || edge.from_node), b = graph.nodes.get(edge.to || edge.to_node);
  const building = graph.buildings.get(a?.building || b?.building);
  if (edge.is_indoor) return 'Through ' + (building?.name || 'building');
  if (edge.id?.startsWith('SEG-P')) return (building?.name || 'Building') + ' perimeter';
  if (b?.building) return 'Approach ' + graph.buildings.get(b.building).name;
  if (a?.building) return 'From ' + graph.buildings.get(a.building).name;
  return 'Campus walkway';
}
async function load() {
  data = applyEdits(await loadDataset(),readEdits());
  graph = buildGraph(data,{enableClosures:false});
  const options = '<optgroup label="Named places">' + graph.places.filter(p=>p.type!=='building').map(option).join('') + '</optgroup><optgroup label="Campus buildings">' + graph.places.filter(p=>p.type==='building').sort((a,b)=>a.name.localeCompare(b.name)).map(option).join('') + '</optgroup>';
  for (const key of ['origin','destination']) { $('#'+key).innerHTML=options; $('#'+key).value=state[key]; $('#'+key).disabled=false; }
  $('#swap').disabled=false;
  $('#use-location').disabled=!('geolocation' in navigator);
  if(!('geolocation' in navigator))setLocationStatus('Location is not supported in this browser.');
  $('#plan-building').innerHTML=[...graph.buildings.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(b=>'<option value="'+esc(b.building_id)+'">'+esc(b.name)+'</option>').join('');
  $('#plan-building').value=state.planBuilding;
  const planCount=Object.values(data.floorplans).reduce((n,b)=>n+b.plans.length,0);
  $('.nav-count').textContent=planCount;
  $('#pilot-counts').textContent=graph.buildings.size+' buildings · '+graph.edges.length.toLocaleString()+' path segments';
  initMap(); wireEvents(); render(true); renderFloor(); registerAgentTools();
}
function option(p) { return '<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>'; }
function initMap() {
  if (!window.L) throw new Error('The local map library could not be loaded.');
  map=L.map('campus-map',{zoomControl:false,scrollWheelZoom:true,preferCanvas:true}).setView([37.2303,-80.4238],16);
  L.control.zoom({position:'topright'}).addTo(map);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  tiles.on('tileload',()=>{tilesLoaded++;$('#map-offline').hidden=true;});
  tiles.on('tileerror',()=>{if(!tilesLoaded)$('#map-offline').hidden=false;});
  tiles.addTo(map); baseLayer=L.layerGroup().addTo(map); routeLayer=L.layerGroup().addTo(map); selectedLayer=L.layerGroup().addTo(map); markersLayer=L.layerGroup().addTo(map); locationLayer=L.layerGroup().addTo(map);
}
function wireEvents() {
  for(const key of ['origin','destination']) $('#'+key).addEventListener('change',e=>{
    state[key]=e.target.value;
    if(key==='origin'&&e.target.value!=='GPS-CURRENT'){state.gps=null;state.gpsAccuracy=null;$('#use-location').classList.remove('active');setLocationStatus('');const opt=$('#origin').querySelector('option[value="GPS-CURRENT"]');if(opt)opt.remove();}
    render(true);
  });
  $('#use-location').addEventListener('click',useMyLocation);
  $('#swap').addEventListener('click',()=>{
    if(state.origin==='GPS-CURRENT'){setLocationStatus('Choose a starting point from the list before swapping.');return;}
    [state.origin,state.destination]=[state.destination,state.origin];$('#origin').value=state.origin;$('#destination').value=state.destination;render(true);
  });
  $('#fit-map').addEventListener('click',fitMap);
  $('#nav-routes').addEventListener('click',()=>switchView('routes'));
  $('#nav-plans').addEventListener('click',()=>switchView('plans'));
  for(const id of ['about-open','sources-open']) $('#'+id).addEventListener('click',()=>{renderData();$('#about-dialog').showModal();});
  $('#about-close').addEventListener('click',()=>$('#about-dialog').close());
  for(const id of ['about-dialog','settings-dialog','assistant-dialog']) $('#'+id).addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
  $('#settings-open').addEventListener('click',()=>{$('#key-gemini').value=getKey('gemini');$('#key-elevenlabs').value=getKey('elevenlabs');$('#settings-dialog').showModal();});
  $('#settings-close').addEventListener('click',()=>$('#settings-dialog').close());
  $('#settings-form').addEventListener('submit',e=>{e.preventDefault();setKey('gemini',$('#key-gemini').value.trim());setKey('elevenlabs',$('#key-elevenlabs').value.trim());$('#settings-dialog').close();});
  $('#settings-clear').addEventListener('click',()=>{setKey('gemini','');setKey('elevenlabs','');$('#key-gemini').value='';$('#key-elevenlabs').value='';});
  $('#assistant-open').addEventListener('click',()=>{$('#assistant-dialog').showModal();$('#assistant-input').focus();});
  $('#assistant-close').addEventListener('click',()=>$('#assistant-dialog').close());
  $('#assistant-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#assistant-input'),text=input.value.trim();if(!text)return;input.value='';askAssistant(text);});
  $('#plan-building').addEventListener('change',e=>{state.planBuilding=e.target.value;state.planFloor='01';state.planZoom=1;renderFloor();});
  $('#plan-floor').addEventListener('change',e=>{state.planFloor=e.target.value;state.planZoom=1;renderFloor();});
  $('#plan-zoom-in').addEventListener('click',()=>{state.planZoom=Math.min(4,state.planZoom+.5);applyPlanZoom();});
  $('#plan-zoom-out').addEventListener('click',()=>{state.planZoom=Math.max(.5,state.planZoom-.5);applyPlanZoom();});
  $('#plan-fit').addEventListener('click',()=>{state.planZoom=1;applyPlanZoom();});
}
function switchView(view) {
  state.view=view; const plans=view==='plans';
  $('#route-controls').hidden=plans; $('#floor-controls').hidden=!plans; $('#map-view').hidden=plans; $('#floor-view').hidden=!plans;
  for(const [id,active] of [['nav-routes',!plans],['nav-plans',plans]]){$('#'+id).classList.toggle('active',active);$('#'+id).setAttribute('aria-pressed',String(active));}
  if(plans)renderFloor();else requestAnimationFrame(()=>{map.invalidateSize();fitMap();});
}
function setLocationStatus(text){ $('#location-status').textContent=text; }
function useMyLocation(){
  if(!('geolocation' in navigator)){setLocationStatus('Location is not supported in this browser.');return;}
  $('#use-location').disabled=true;
  setLocationStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    pos=>{
      state.gps=[pos.coords.longitude,pos.coords.latitude];
      state.gpsAccuracy=pos.coords.accuracy;
      if(!$('#origin').querySelector('option[value="GPS-CURRENT"]')){
        const opt=document.createElement('option');opt.value='GPS-CURRENT';opt.textContent='📍 Your location';
        $('#origin').prepend(opt);
      }
      state.origin='GPS-CURRENT';$('#origin').value='GPS-CURRENT';
      $('#use-location').disabled=false;$('#use-location').classList.add('active');
      render(true);
    },
    err=>{
      $('#use-location').disabled=false;
      const messages={1:'Location permission was denied.',2:'Your location is unavailable right now.',3:'Finding your location timed out.'};
      setLocationStatus(messages[err.code]||'Could not get your location.');
    },
    {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
  );
}
function injectGpsPlace(){
  if(state.origin!=='GPS-CURRENT'||!state.gps)return;
  let nearest=null;
  for(const [id,n] of graph.nodes){
    if(id.startsWith('B:')||!n.coordinates)continue;
    const d=haversine(state.gps,n.coordinates);
    if(!nearest||d<nearest.d)nearest={id,d,coordinates:n.coordinates};
  }
  if(nearest&&nearest.d<=GPS_SNAP_METERS){
    graph.nodes.set('N-GPS-CURRENT',{coordinates:state.gps});
    if(!graph.adj.has('N-GPS-CURRENT'))graph.adj.set('N-GPS-CURRENT',[]);
    if(!graph.adj.has(nearest.id))graph.adj.set(nearest.id,[]);
    graph.adj.get('N-GPS-CURRENT').push({id:'VIRT-GPS',kind:'virtual',from:'N-GPS-CURRENT',to:nearest.id,meters:nearest.d,coordinates:[state.gps,nearest.coordinates]});
    graph.adj.get(nearest.id).push({id:'VIRT-GPS',kind:'virtual',from:nearest.id,to:'N-GPS-CURRENT',meters:nearest.d,coordinates:[nearest.coordinates,state.gps]});
    graph.places.push({id:'GPS-CURRENT',node:'N-GPS-CURRENT',name:'Your location',coordinates:state.gps,type:'gps'});
    setLocationStatus('Located within '+Math.round(state.gpsAccuracy)+' m'+(nearest.d>5?' · nearest mapped path is '+Math.round(nearest.d)+' m away':'')+'.');
  }else{
    let nearestBuilding=null;
    for(const b of graph.buildings.values()){
      const d=haversine(state.gps,b.coordinates);
      if(!nearestBuilding||d<nearestBuilding.d)nearestBuilding={id:b.building_id,name:b.name,d};
    }
    if(nearestBuilding){
      graph.places.push({id:'GPS-CURRENT',node:'B:'+nearestBuilding.id,name:'Your location',coordinates:state.gps,type:'gps'});
      setLocationStatus('No mapped path within '+GPS_SNAP_METERS+' m, so routing from '+nearestBuilding.name+' (~'+Math.round(nearestBuilding.d)+' m away) instead.');
    }
  }
}
function render(fit=false) {
  graph=buildGraph(data,{enableClosures:false});
  injectGpsPlace();
  route=findRoute(graph,state.origin,state.destination);
  const from=resolvePlace(graph,state.origin),to=resolvePlace(graph,state.destination);
  const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('travelmode','walking');
  if(from?.coordinates&&to?.coordinates){url.searchParams.set('origin',from.coordinates[1]+','+from.coordinates[0]);url.searchParams.set('destination',to.coordinates[1]+','+to.coordinates[0]);$('#google-compare').href=url.href;}
  if(state.origin&&state.destination&&state.origin!==state.destination){
    const exists=route.found;
    const link=$('#edit-route');link.hidden=false;link.textContent=exists?'Edit this route ↗':'This route isn’t mapped yet — create it ↗';
    link.href='route-editor.html?from='+encodeURIComponent(state.origin)+'&to='+encodeURIComponent(state.destination);
  }else{$('#edit-route').hidden=true;}
  if(!route.found){
    $('#route-summary').innerHTML='<div class="no-route"><span aria-hidden="true">⌁</span><h3>No route is mapped.</h3><p>'+esc(route.reason)+'</p></div>';$('#directions').innerHTML='';
  }else if(route.samePlace){
    $('#route-summary').innerHTML='<div class="no-route"><h3>You’re already there.</h3><p>These places use the same mapped entrance. No walk is needed in the current dataset.</p></div>';$('#directions').innerHTML='';
  }else if(route.sameEntrance){
    $('#route-summary').innerHTML='<div class="no-route"><h3>Indoor travel is not mapped yet.</h3><p>These places share a mapped entrance, but the supplied dataset does not describe the indoor path between them.</p></div>';$('#directions').innerHTML='';
  }else{
    $('#route-summary').innerHTML='<div class="route-card selected"><span class="route-card-top"><strong>Campus route</strong></span><span class="card-time">'+duration(route)+'</span><span class="card-subtitle">'+distance(route)+'</span></div>';
    const startEntrance=route.startEntrance?.entrance_name||'Mapped entrance',endEntrance=route.endEntrance?.entrance_name||'Mapped entrance';
    $('#directions').innerHTML='<div class="directions-title"><h3>Route details</h3><button id="read-aloud" class="text-button" type="button">▶ Read aloud</button><span>'+route.legs.length+' segments</span></div><ol class="directions"><li class="endpoint"><span class="step-icon">A</span><div><strong>'+esc(route.start.name)+'</strong><small>'+esc(startEntrance)+' · Approximate</small></div></li>'+route.legs.map(e=>'<li><span class="step-icon">'+(e.is_indoor?'⌂':'↗')+'</span><div><strong>'+esc(edgeName(e))+'</strong><small>'+Math.round(e.meters)+' m'+(e.is_indoor?' · Indoor':'')+'</small>'+(e.is_indoor && data.floorplans[e.building||graph.nodes.get(e.from)?.building]?.plans?.length?'<button class="text-button" data-floor-building="'+esc(e.building||graph.nodes.get(e.from)?.building||'')+'">View floorplan ↗</button>':'')+'</div></li>').join('')+'<li class="endpoint"><span class="step-icon destination">B</span><div><strong>'+esc(route.end.name)+'</strong><small>'+esc(endEntrance)+' · Approximate</small></div></li></ol>';
    $('#directions').querySelectorAll('[data-floor-building]').forEach(button=>button.addEventListener('click',()=>{state.planBuilding=button.dataset.floorBuilding;state.planFloor='01';$('#plan-building').value=state.planBuilding;switchView('plans');}));
    $('#read-aloud')?.addEventListener('click',()=>readAloud(route));
  }
  renderMap(); if(fit)fitMap();
}
function renderMap() {
  baseLayer.clearLayers();routeLayer.clearLayers();selectedLayer.clearLayers();markersLayer.clearLayers();locationLayer.clearLayers();
  if(route.found)for(const e of route.legs){L.polyline(e.coordinates.map(latLng),{color:'#fff',weight:9,opacity:.95}).addTo(selectedLayer);L.polyline(e.coordinates.map(latLng),{color:e.is_indoor?'#8358a3':'#14705b',weight:5,opacity:1}).bindTooltip(esc(edgeName(e))).addTo(selectedLayer);}
  for(const building of graph.buildings.values()){
    const marker=L.circleMarker(latLng(building.coordinates),{radius:4,color:'#fff',weight:2,fillColor:'#284e46',fillOpacity:1});
    marker.bindTooltip(esc(building.name),{direction:'top',className:'building-tooltip',permanent:false});
    marker.on('click',()=>{state.destination=building.building_id;$('#destination').value=state.destination;render(true);});
    marker.addTo(markersLayer);
  }
  for(const [key,letter] of [['origin','A'],['destination','B']]){
    if(key==='origin'&&state.origin==='GPS-CURRENT')continue;
    const p=resolvePlace(graph,state[key]);if(!p)continue;
    const ent=route.found?(key==='origin'?route.startEntrance:route.endEntrance):null;
    L.marker(latLng(ent?.coordinates||p.coordinates),{icon:L.divIcon({className:'route-marker',html:'<span class="'+(letter==='B'?'end':'')+'">'+letter+'</span>',iconSize:[34,34],iconAnchor:[17,17]}),title:p.name,keyboard:true}).bindTooltip(esc(p.name),{direction:'top',offset:[0,-18],permanent:true,className:'endpoint-tooltip'}).addTo(markersLayer);
  }
  if(state.origin==='GPS-CURRENT'&&state.gps){
    if(state.gpsAccuracy)L.circle(latLng(state.gps),{radius:state.gpsAccuracy,color:'#2869dc',weight:1,fillColor:'#2869dc',fillOpacity:.12}).addTo(locationLayer);
    L.marker(latLng(state.gps),{icon:L.divIcon({className:'gps-marker',html:'<span></span>',iconSize:[18,18],iconAnchor:[9,9]}),keyboard:true}).bindTooltip('Your location',{direction:'top',offset:[0,-12],permanent:true,className:'endpoint-tooltip'}).addTo(locationLayer);
  }
}
function fitMap(){
  const coords=route?.found?route.legs.flatMap(e=>e.coordinates):[];
  if(coords.length)map.fitBounds(L.latLngBounds(coords.map(latLng)),{paddingTopLeft:[60,90],paddingBottomRight:[45,70],maxZoom:17});
  else map.fitBounds(L.latLngBounds([...graph.buildings.values()].map(b=>latLng(b.coordinates))),{padding:[35,70],maxZoom:16});
}
function renderFloor(){
  if(!data)return; const info=data.floorplans[state.planBuilding],building=graph.buildings.get(state.planBuilding);
  if(!info)return;
  $('#plan-building').value=state.planBuilding;
  $('#plan-floor').innerHTML=info.plans.length?info.plans.map(p=>'<option value="'+esc(p.code)+'">'+esc(p.label)+'</option>').join(''):'<option>No floorplans supplied</option>';
  $('#plan-floor').disabled=!info.plans.length;
  const plan=info.plans.find(p=>p.code===state.planFloor)||info.plans[0];
  state.planFloor=plan?.code||'';$('#plan-floor').value=state.planFloor;
  $('#floor-title').textContent=info.name+(plan?' · '+plan.label:'');
  $('#floor-image').hidden=!plan;$('#floor-empty').hidden=!!plan;
  if(plan){$('#floor-image').src=plan.file;$('#floor-image').alt=info.name+', '+plan.label+', historical floorplan dated September 2006';}
  else{$('#floor-image').removeAttribute('src');$('#floor-empty').innerHTML='<span aria-hidden="true">▤</span><h3>No floorplan in this archive.</h3><p>'+esc(info.name)+' has no matching plan in the supplied collection. The campus location is still available in the route planner.</p>';}
  for(const id of ['plan-zoom-out','plan-zoom-in','plan-fit'])$('#'+id).disabled=!plan;
  $('#building-detail').innerHTML='<h3>Building information</h3><dl><dt>Address</dt><dd>'+esc(building?.address||'Not supplied')+'</dd><dt>Plans available</dt><dd>'+info.plans.length+'</dd></dl>';
  applyPlanZoom();
}
function applyPlanZoom(){ $('#floor-image').style.width=(state.planZoom*100)+'%';$('#floor-image').style.maxWidth='none';$('#plan-fit').textContent=state.planZoom===1?'Fit':Math.round(state.planZoom*100)+'%';$('#floor-canvas').scrollTo({top:0,left:0,behavior:'instant'}); }
function renderData(){
  const count=Object.values(data.floorplans).reduce((n,b)=>n+b.plans.length,0);
  $('#data-stats').innerHTML=[[String(graph.buildings.size),'buildings'],[String(graph.edges.length),'path segments'],[String(count),'archival plans']].map(([n,label])=>'<div><strong>'+n+'</strong><span>'+label+'</span></div>').join('');
  $('#status-list').innerHTML=graph.statusLog.map(r=>'<div class="status-record"><div><strong>'+esc(r.asset_id)+'</strong><span>'+esc(r.status)+' · '+esc(r.result)+'</span></div><p>'+esc(r.reason)+'</p><small>Supplied source: '+esc(r.source)+' · '+esc(r.reported_at)+'</small></div>').join('');
}
function applyRouteConfig(input){
  if(!input||typeof input!=='object'||!Object.hasOwn(input,'origin')||!Object.hasOwn(input,'destination')||Object.keys(input).some(k=>!['origin','destination'].includes(k)))throw new Error('Invalid route configuration');
  for(const key of ['origin','destination'])if(typeof input[key]!=='string'||!graph.places.some(p=>p.id===input[key]))throw new Error('Choose a valid place ID');
  Object.assign(state,input);$('#origin').value=state.origin;$('#destination').value=state.destination;switchView('routes');render(true);
  return {found:route.found,meters:route.meters??null,reason:route.reason??'Route preview'};
}
function narrationScript(r){
  const lines=['Route preview from '+r.start.name+' to '+r.end.name+'.'];
  r.legs.forEach((e,i)=>lines.push('Step '+(i+1)+': '+edgeName(e)+', about '+Math.round(e.meters)+' meters.'));
  lines.push('You should arrive near '+(r.endEntrance?.entrance_name||'the mapped entrance')+'. This position is approximate.');
  return lines.join(' ');
}
async function readAloud(r){
  const button=$('#read-aloud'),text=narrationScript(r);
  if(button){button.disabled=true;button.textContent='Reading…';}
  try{
    const key=getKey('elevenlabs');
    if(key){
      const res=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+ELEVEN_VOICE,{method:'POST',headers:{'Content-Type':'application/json','xi-api-key':key},body:JSON.stringify({text,model_id:'eleven_multilingual_v2'})});
      if(!res.ok)throw new Error('ElevenLabs request failed ('+res.status+')');
      const audio=new Audio(URL.createObjectURL(await res.blob()));
      await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=reject;audio.play().catch(reject);});
    }else if('speechSynthesis' in window){
      window.speechSynthesis.cancel();
      const spoken=new Promise(resolve=>{const u=new SpeechSynthesisUtterance(text);u.onend=resolve;u.onerror=resolve;window.speechSynthesis.speak(u);});
      const safetyTimeout=new Promise(resolve=>setTimeout(resolve,Math.min(60000,Math.max(8000,text.length*90))));
      await Promise.race([spoken,safetyTimeout]);
    }else throw new Error('Voice playback is not supported in this browser.');
  }catch(err){console.error(err);}
  finally{if(button){button.disabled=false;button.textContent='▶ Read aloud';}}
}
function addAssistantMessage(role,text){
  const div=document.createElement('div');div.className='assistant-msg '+role;div.textContent=text;
  $('#assistant-log').appendChild(div);$('#assistant-log').scrollTop=$('#assistant-log').scrollHeight;
  return div;
}
function localIntent(text){
  const lower=text.toLowerCase();
  const matches=graph.places.filter(p=>lower.includes(p.name.toLowerCase())||(p.aliases||[]).some(a=>lower.includes(a.toLowerCase())));
  if(matches.length<2)return{action:'clarify',message:'I can only match places from the pilot list. Try naming two of them directly, like "Perry Place to Pamplin Hall" — add a Gemini key in AI & voice keys for more flexible phrasing.'};
  const [origin,destination]=matches;
  return{action:'route',origin:origin.id,destination:destination.id,message:'Set the route from '+origin.name+' to '+destination.name+'. No Gemini key configured, so this used simple keyword matching, not AI.'};
}
async function askGemini(text,key){
  const placeList=graph.places.map(p=>p.id+' = "'+p.name+'"'+(p.aliases?.length?' (aka '+p.aliases.join(', ')+')':'')).join('\n');
  const system='You configure a campus route PREVIEW for AccessPath, a Virginia Tech campus pilot. '
    +'Pick origin and destination ONLY from this exact list of place IDs (never invent a place, never return a name in place of its id):\n'+placeList
    +'\n\nRules: this app has NOT verified route conditions in the field. Never state or imply a route is confirmed safe or current — that is for the app’s own data to show, not you. '
    +'If the request names two places from the list, respond with action "route" and both IDs. '
    +'If you cannot confidently match two places from the list, respond with action "clarify" and a short question naming a few real places from the list. Keep "message" to one short, plain sentence.';
  const schema={type:'OBJECT',properties:{action:{type:'STRING',enum:['route','clarify']},origin:{type:'STRING'},destination:{type:'STRING'},message:{type:'STRING'}},required:['action','message']};
  const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+GEMINI_MODEL+':generateContent?key='+encodeURIComponent(key),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text}]}],generationConfig:{responseMimeType:'application/json',responseSchema:schema}})
  });
  if(!res.ok)throw new Error('Gemini request failed ('+res.status+')');
  const body=await res.json(),raw=body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!raw)throw new Error('Gemini returned no usable response');
  let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('Gemini response was not valid JSON');}
  if(parsed.action==='route'&&(!graph.places.some(p=>p.id===parsed.origin)||!graph.places.some(p=>p.id===parsed.destination)))return{action:'clarify',message:'That didn’t match two places in the pilot area. Try naming them directly.'};
  return parsed;
}
async function askAssistant(text){
  addAssistantMessage('user',text);
  const thinking=addAssistantMessage('assistant','Thinking…');
  try{
    const key=getKey('gemini'),result=key?await askGemini(text,key):localIntent(text);
    thinking.remove();
    if(result.action==='route'){applyRouteConfig({origin:result.origin,destination:result.destination});}
    addAssistantMessage('assistant',result.message||'Updated the route preview.');
  }catch(err){thinking.remove();addAssistantMessage('assistant','That didn’t work: '+err.message);}
}
function registerAgentTools(){
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'get_accesspath_route',description:'Read the current exploratory route and data limitations.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({route,warning:'Supplied pilot data; route conditions are unverified.'})});
  register({name:'configure_accesspath_route',description:'Change the visible campus route preview using listed place IDs. This does not start real navigation.',inputSchema:{type:'object',properties:{origin:{type:'string'},destination:{type:'string'}},required:['origin','destination'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>applyRouteConfig(input)});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
load().catch(error=>{$('#route-summary').innerHTML='<div class="no-route"><h3>We couldn’t load the planner.</h3><p>'+esc(error.message)+'</p><button class="primary-button" onclick="location.reload()">Try again</button></div>';console.error(error);});
window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY)location.reload();});
