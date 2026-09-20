import {buildGraph, findRoute, haversine, routeProgress, navigationDecision} from './router.mjs';
import {createLocationTracker, usablePosition} from './location.mjs';
import {aiIntent} from './assistant.mjs';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={sparkles:'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4z M20 2v4 M18 4h4',settings:'M12 8a4 4 0 100 8 4 4 0 000-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',expand:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',locate:'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M19 12a7 7 0 11-14 0 7 7 0 0114 0 M14 12a2 2 0 11-4 0 2 2 0 014 0',swap:'M7 3v17 M3 7l4-4 4 4 M17 21V4 M13 17l4 4 4-4',walk:'M13 4a1.5 1.5 0 110-.1 M7 12l3-4 4 1 3 4h3 M10 8l-1 7-4 5 M10 14l5 3v4',info:'M12 11v6 M12 7v.1 M22 12a10 10 0 11-20 0 10 10 0 0120 0',map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',close:'M6 6l12 12 M18 6L6 18','arrow-up':'M12 20V4 M5 11l7-7 7 7',arrow:'M4 12h16 M14 6l6 6-6 6',navigate:'M4 11l16-7-7 16-2-7z',volume:'M3 9h4l5-4v14l-5-4H3z M16 8a6 6 0 010 8 M19 5a10 10 0 010 14',flag:'M5 22V3 M5 3h14l-3 4 3 4H5',chevron:'M8 5l7 7-7 7',left:'M19 20v-8a5 5 0 00-5-5H4 M9 2L4 7l5 5',right:'M5 20v-8a5 5 0 015-5h10 M15 2l5 5-5 5',stop:'M6 6h12v12H6z'};
const icon=n=>`<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n]||paths.arrow}"/></svg>`;
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));}
icons();
let data,graph,route,map,routeLayer,buildingLayer,markerLayer,closureLayer,gpsLayer;
const state={origin:'VT-GOODWIN',destination:'VT-DDS',avoidStairs:true,gps:null,watch:null,navigating:false,voice:true,lastSpoken:-1,reroutedAt:0,progress:0,follow:true};
const demos=[{from:'VT-GOODWIN',to:'VT-DDS',label:'Goodwin → Data & Decision Sciences'},{from:'POI-PERRY-PLACE',to:'VT-PAMPLIN',label:'Perry Place → Pamplin'},{from:'VT-DAVIDSON',to:'VT-NCB',label:'Davidson → Classroom Building'},{from:'POI-TURNER-PLACE',to:'VT-NEWMAN-LIB',label:'Turner Place → Newman Library'}];
const latlng=c=>[c[1],c[0]];
const getPlace=id=>graph.places.find(p=>p.id===id);
function toast(t){$('#toast').textContent=t;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function load(){
 const names={buildings:'buildings.geojson',entrances:'entrances.geojson',paths:'paths.geojson',pois:'pois.geojson'};
 data=Object.fromEntries(await Promise.all(Object.entries(names).map(async([k,f])=>{const r=await fetch('data/'+f,{cache:'no-store'});if(!r.ok)throw Error('Campus data could not load. Refresh to try again.');return[k,await r.json()];})));
 const meta=await fetch('data/camp-path-manifest.json',{cache:'no-store'});data.metadata=meta.ok?await meta.json():{};
 const closures=await fetch('data/closures.geojson',{cache:'no-store'});data.closures=closures.ok?await closures.json():{features:[]};
 graph=buildGraph(data);initMap();wire();syncInputs();render();
}
function initMap(){
 map=L.map('campus-map',{zoomControl:false,preferCanvas:true}).setView([37.229,-80.4233],16);
 L.control.zoom({position:'topright'}).addTo(map);map.on('dragstart',()=>{state.follow=false;});
 let loaded=false;L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).on('tileload',()=>{loaded=true;$('#map-offline').hidden=true;}).on('tileerror',()=>{if(!loaded)$('#map-offline').hidden=false;}).addTo(map);
 routeLayer=L.layerGroup().addTo(map);buildingLayer=L.layerGroup().addTo(map);markerLayer=L.layerGroup().addTo(map);gpsLayer=L.layerGroup().addTo(map);closureLayer=L.geoJSON(data.closures,{style:{color:'#dc742e',weight:2,dashArray:'5 4',fillColor:'#ef975a',fillOpacity:.3}}).bindTooltip('Closed for construction').addTo(map);
 for(const p of graph.places.filter(p=>p.type==='building'))L.circleMarker(latlng(p.coordinates),{radius:4,color:'#97607d',weight:1.5,fillColor:'white',fillOpacity:1}).bindTooltip(p.name).on('click',()=>{state.destination=p.id;stopNavigation();syncInputs();render();}).addTo(buildingLayer);
}
function syncInputs(){for(const k of ['origin','destination'])$('#'+k).value=k==='origin'&&state.origin==='GPS'?'Your location':getPlace(state[k])?.name||'';}
function wire(){
 for(const key of ['origin','destination'])setupSearch(key);
 $('#route-form').onsubmit=e=>{e.preventDefault();render();};
 $('#swap').onclick=()=>{if(state.origin==='GPS'){toast('Choose a building to swap your route.');return;}stopNavigation();[state.origin,state.destination]=[state.destination,state.origin];syncInputs();render();};
 $('#avoid-stairs').onchange=e=>{state.avoidStairs=e.target.checked;state.lastSpoken=-1;render();};
 $('#fit-map').onclick=fitRoute;$('#locate-map').onclick=()=>useLocation(false);
 for(const id of ['assistant','settings','data'])$('#'+(id==='data'?'data-open':id+'-open')).onclick=()=>{if(id==='data')renderData();if(id==='settings')loadSettings();if(id==='assistant')updateAIStatus();$('#'+id+'-dialog').showModal();};
 document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
 $('#demo-list').innerHTML=demos.map((d,i)=>`<button class="demo-route" data-demo="${i}"><span>${icon(i===3?'map':'walk')}</span><span>${esc(d.label)}</span><span class="route-arrow">${icon('chevron')}</span></button>`).join('');
 $('#demo-list').onclick=e=>{const b=e.target.closest('[data-demo]');if(!b)return;stopNavigation();const d=demos[+b.dataset.demo];state.origin=d.from;state.destination=d.to;syncInputs();render();};
 $('#settings-form').onsubmit=e=>{e.preventDefault();sessionStorage.setItem('camp-path-gemini-key',$('#gemini-key').value.trim());localStorage.setItem('camp-path-model',$('#gemini-model').value.trim()||'gemini-2.5-flash');state.voice=$('#voice-enabled').checked;localStorage.setItem('camp-path-voice',$('#voice-select').value);$('#settings-dialog').close();toast('Settings saved.');};
 $('#clear-key').onclick=()=>{sessionStorage.removeItem('camp-path-gemini-key');$('#gemini-key').value='';$('#settings-status').textContent='API key cleared.';};
 $('#assistant-form').onsubmit=e=>{e.preventDefault();askAssistant($('#assistant-input').value);};
 document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>askAssistant(b.dataset.prompt));
}
function setupSearch(key){
 const input=$('#'+key),list=$('#'+key+'-options');let selected=-1,matches=[];
 const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
 const pick=i=>{const p=matches[i];if(!p)return;if(p.id==='GPS'){useLocation(false);close();return;}stopNavigation();state[key]=p.id;syncInputs();close();render();};
 const show=()=>{const q=input.value.toLowerCase().trim();matches=graph.places.filter(p=>!q||[p.name,...(p.aliases||[])].some(n=>n.toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,30);if(key==='origin'&&(!q||/^(here|gps|my loc|current loc|your loc|use my)/.test(q)))matches.unshift({id:'GPS',name:'Use my current location',type:'gps'});selected=-1;list.innerHTML=matches.length?matches.map((p,i)=>`<button type="button" id="${key}-option-${i}" role="option" aria-selected="false" data-index="${i}">${esc(p.name)}${p.type==='gps'?'<small>Start from where you are</small>':''}</button>`).join(''):'<div class="help-text" style="padding:10px">No campus places found.</div>';list.hidden=false;input.setAttribute('aria-expanded','true');};
 input.addEventListener('focus',()=>{input.select();show();});input.addEventListener('input',show);
 input.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(list.hidden)show();selected=Math.max(0,Math.min(matches.length-1,selected+(e.key==='ArrowDown'?1:-1)));list.querySelectorAll('[role=option]').forEach((b,i)=>b.setAttribute('aria-selected',String(i===selected)));const active=list.children[selected];if(active){input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});}}else if(e.key==='Enter'&&!list.hidden){e.preventDefault();pick(selected<0?0:selected);}else if(e.key==='Escape'){close();syncInputs();}});
 list.addEventListener('mousedown',e=>e.preventDefault());list.onclick=e=>{const b=e.target.closest('[data-index]');if(b)pick(+b.dataset.index);};
 input.addEventListener('blur',()=>setTimeout(()=>{close();syncInputs();},120));
}
function render(fit=true){
 route=findRoute(graph,state.origin,state.destination,{avoidStairs:state.avoidStairs,gps:state.gps});
 routeLayer.clearLayers();markerLayer.clearLayers();
 document.querySelectorAll('[data-demo]').forEach(b=>{const d=demos[+b.dataset.demo];b.classList.toggle('active',d.from===state.origin&&d.to===state.destination);});
 if(!route.found){$('#route-result').innerHTML=`<div class="error-state"><h3>No route available</h3><p>${esc(route.reason)}</p></div>`;return;}
 if(route.samePlace){$('#route-result').innerHTML='<div class="error-state"><h3>You’re already there.</h3><p>Choose another destination to start a walk.</p></div>';return;}
 const coords=route.legs.flatMap(e=>e.coordinates);
 if(coords.length){L.polyline(coords.map(latlng),{color:'white',weight:10,opacity:.95}).addTo(routeLayer);L.polyline(coords.map(latlng),{color:'#750539',weight:5,opacity:1,lineCap:'round',lineJoin:'round'}).addTo(routeLayer);}
 const a=coords[0]||route.start.coordinates,b=coords.at(-1)||route.end.coordinates;
 for(const [p,text,origin] of [[a,'A',true],[b,'B',false]])L.marker(latlng(p),{icon:L.divIcon({className:'',html:`<div class="place-marker ${origin?'origin':''}">${text}</div>`,iconSize:[31,31],iconAnchor:[15,15]})}).addTo(markerLayer);
 const minutes=Math.max(1,Math.round(route.seconds/60));
 $('#route-result').innerHTML=`<div class="route-topline"><div><div class="route-time">${minutes}<small>min</small></div><div class="route-distance">${route.meters>=1000?(route.meters/1000).toFixed(1)+' km':Math.round(route.meters)+' m'} · Walking</div></div><span class="route-badge">${state.avoidStairs?'Avoids mapped stairs':'Walking route'}</span></div><p class="route-via">${route.label?esc(route.label[0].toUpperCase()+route.label.slice(1)):'To <b>'+esc(route.end.name)+'</b>'}</p><div class="route-actions"><button id="start-navigation" class="primary-button">${icon(state.navigating?'stop':'navigate')}${state.navigating?'Stop navigation':'Start walking'}</button><button id="read-route" class="icon-button" aria-label="Read route directions aloud" title="Read directions">${icon('volume')}</button></div><p class="route-note">${route.endEntrance?.kind==='nearby_path'?'Arrives at a nearby mapped path; the entrance is unmapped.':route.journeyId==='turner-newman'?'Arrives inside Newman Library at the bridge elevator.':route.indoor?'Includes building passages. Doors must be open.':'Construction areas excluded.'} ${state.avoidStairs?'Stair avoidance is based on OSM tags.':''}</p><details class="steps-details"><summary>Walking directions ${icon('chevron')}</summary><ol class="steps-list">${(route.steps||route.legs.filter(l=>l.meters>5).slice(0,12).map(l=>({text:l.name?'Continue on '+l.name:'Continue along the campus path',meters:l.meters,icon:'arrow'}))).map(s=>`<li><span class="step-icon">${icon(s.icon||'arrow')}</span><span>${esc(s.text)}<small>${Math.round(s.meters)} m</small></span></li>`).join('')}<li><span class="step-icon">${icon('flag')}</span><span>Arrive at ${esc(route.end.name)}</span></li></ol></details>`;
 $('#read-route').onclick=()=>speak((route.steps||[]).map(s=>s.text).join('. ')||`Walk ${Math.round(route.meters)} meters to ${route.end.name}.`);
 $('#start-navigation').onclick=()=>state.navigating?stopNavigation():useLocation(true);
 if(fit)fitRoute();
}
function fitRoute(){const pts=route?.legs.flatMap(e=>e.coordinates)||[];if(pts.length){const mobile=innerWidth<=640;map.fitBounds(pts.map(latlng),{paddingTopLeft:mobile?[40,60]:[420,85],paddingBottomRight:mobile?[40,50]:[90,80],maxZoom:18});}}
function speak(text){if(!('speechSynthesis'in window)){toast('Spoken directions aren’t supported in this browser.');return;}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);const v=speechSynthesis.getVoices().find(v=>v.voiceURI===localStorage.getItem('camp-path-voice'));if(v)u.voice=v;u.rate=.98;speechSynthesis.speak(u);}
function loadSettings(){$('#gemini-key').value=sessionStorage.getItem('camp-path-gemini-key')||'';$('#gemini-model').value=localStorage.getItem('camp-path-model')||'gemini-2.5-flash';$('#voice-enabled').checked=state.voice;$('#settings-status').textContent='';const voices=window.speechSynthesis?.getVoices()||[];$('#voice-select').innerHTML='<option value="">Device default</option>'+voices.filter(v=>v.lang.startsWith('en')).map(v=>`<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('');$('#voice-select').value=localStorage.getItem('camp-path-voice')||'';}
function updateAIStatus(){$('#ai-status').textContent=sessionStorage.getItem('camp-path-gemini-key')?'Gemini connected · Routes are calculated from the campus map.':'Add a Gemini key in settings to enable AI. Basic place matching works without one.';}
function renderData(){$('#data-details').innerHTML=`<p><b>${graph.buildings.size} campus buildings.</b> ${Number(data.metadata.segments||0).toLocaleString()} walking segments from OpenStreetMap, with your campus corrections.</p><p>Construction areas are excluded. “Avoid stairs” skips mapped stairways; it is not a wheelchair-accessibility guarantee.</p><p>Indoor passages may require open doors. Routes end at a mapped entrance or a nearby mapped path. ${[...graph.buildings.values()].filter(b=>b.arrival_kind==='nearby_path').length} buildings use nearby-path arrival points.</p><p><small>OSM snapshot: ${esc((data.metadata.snapshot_timestamp||'').slice(0,10))}. Data is bundled for this local demo, not a live closure feed.</small></p><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a></p><small>Local hackathon demonstration. Live location stays on your device.</small>`;}
let locating=false,firstFix=false,offRouteSamples=0,lastFixTime=0;
const tracker=createLocationTracker(navigator.geolocation,{onPosition:receivePosition,onError:locationError});
function locationMessage(text){$('#location-status').textContent=text;$('#location-status').hidden=!text;}
function useLocation(navigate=false){
 if(!window.isSecureContext){locationMessage('Live GPS requires localhost or HTTPS. Open this demo on localhost.');return;}
 if(!navigator.geolocation){locationMessage('This browser does not support live location. Choose a building instead.');return;}
 if(navigate&&!route?.found){toast('Choose a connected route first.');return;}
 state.navigating=navigate;state.follow=true;locating=!navigate;firstFix=true;offRouteSamples=0;state.lastSpoken=-1;
 locationMessage('Finding your live location…');tracker.start();
 if(navigate){$('#navigation-banner').hidden=false;$('#navigation-banner').innerHTML=icon('locate')+'<div><strong>Finding your location</strong><small>Allow location access to start walking.</small></div><button id="stop-live" class="icon-button" aria-label="Stop navigation">'+icon('close')+'</button>';$('#stop-live').onclick=()=>stopNavigation();if($('#start-navigation'))$('#start-navigation').innerHTML=icon('stop')+'Stop navigation';}
}
function receivePosition(position){
 if(!usablePosition(position)){locationMessage('Waiting for a fresh GPS reading…');return;}
 const c=position.coords;state.gps=[c.longitude,c.latitude];lastFixTime=Date.now();gpsLayer.clearLayers();
 L.circle(latlng(state.gps),{radius:Math.min(c.accuracy,250),weight:1,color:'#387bf0',fillColor:'#387bf0',fillOpacity:.07,interactive:false}).addTo(gpsLayer);
 L.marker(latlng(state.gps),{icon:L.divIcon({className:'',html:'<div class="gps-marker"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(gpsLayer);
 if(c.accuracy>45){locationMessage('GPS accuracy is ±'+Math.round(c.accuracy)+' m. Waiting for a clearer signal before giving turns.');return;}
 locationMessage('Live GPS · accuracy ±'+Math.round(c.accuracy)+' m');
 if(locating){state.origin='GPS';syncInputs();render();tracker.stop();locating=false;locationMessage('Location set · accuracy ±'+Math.round(c.accuracy)+' m. Start walking for live updates.');return;}
 if(!state.navigating)return;
 let progress=routeProgress(route,state.gps);
 if(firstFix){firstFix=false;if(!progress||progress.offRoute>35){state.origin='GPS';syncInputs();render();progress=routeProgress(route,state.gps);}}
 if(!route?.found&&Date.now()-state.reroutedAt>4000){state.reroutedAt=Date.now();state.origin='GPS';syncInputs();render(false);progress=routeProgress(route,state.gps);}
 if(!route?.found||!progress){$('#navigation-banner').innerHTML=icon('info')+'<div><strong>Move closer to campus paths</strong><small>'+esc(route?.reason||'No route at this location.')+'</small></div><button id="stop-live" class="icon-button" aria-label="Stop navigation">'+icon('close')+'</button>';$('#stop-live').onclick=()=>stopNavigation();return;}
 const decision=navigationDecision(progress,c.accuracy,offRouteSamples);offRouteSamples=decision.offRouteSamples;
 if(decision.action==='arrive'){
  const destination=route.end.name;stopNavigation(false);locationMessage('You’ve arrived at '+destination+'.');$('#navigation-banner').hidden=false;$('#navigation-banner').innerHTML=icon('flag')+'<div><strong>You’ve arrived</strong><small>'+esc(destination)+'</small></div><button id="stop-live" class="icon-button" aria-label="Dismiss arrival">'+icon('close')+'</button>';$('#stop-live').onclick=()=>stopNavigation();if(state.voice)speak('You have arrived at '+destination);return;
 }
 if(decision.action==='reroute'&&Date.now()-state.reroutedAt>10000){state.reroutedAt=Date.now();offRouteSamples=0;state.origin='GPS';syncInputs();render(false);state.lastSpoken=-1;progress=routeProgress(route,state.gps);if(!route.found||!progress){locationMessage('Couldn’t reconnect to a mapped path. Follow your surroundings and return to a campus path.');$('#navigation-banner').hidden=true;return;}if(state.voice)speak('Updating your walking route.');}
 if(state.follow){if(map.getZoom()<17)map.setZoom(17);map.panTo(latlng(state.gps),{animate:true});}
 const step=route.steps[progress.stepIndex];if(!step)return;
 const left=Math.max(0,step.end-progress.along),next=route.steps[progress.stepIndex+1];
 const title=left<25&&next?next.text:step.text;
 $('#navigation-banner').hidden=false;$('#navigation-banner').innerHTML=icon(left<25&&next?next.icon:step.icon)+'<div><strong>'+esc(title)+'</strong><small>'+Math.round(left)+' m · '+Math.max(1,Math.round(progress.remaining/75))+' min remaining</small></div><button id="stop-live" class="icon-button" aria-label="Stop navigation">'+icon('close')+'</button>';$('#stop-live').onclick=()=>stopNavigation();
 if(state.voice&&state.lastSpoken!==progress.stepIndex){state.lastSpoken=progress.stepIndex;speak(step.text+(next?'. In '+Math.round(left)+' meters, '+next.text.toLowerCase():'. Your destination is ahead.'));}
 state.progress=progress.along;
}
function locationError(error){
 const messages={0:'This browser does not support live GPS.',1:'Location permission was denied. Enable location access in your browser, or choose a building.',2:'GPS is unavailable. Try again outdoors.',3:'GPS is taking longer than expected. Waiting for a signal…'};
 locationMessage(messages[error.code]||'Couldn’t get your location.');
 if(error.code===1||error.code===0){stopNavigation(false);}else if(state.navigating){$('#navigation-banner').innerHTML=icon('locate')+'<div><strong>Waiting for GPS</strong><small>'+esc(messages[error.code]||'Try again outdoors.')+'</small></div><button id="stop-live" class="icon-button" aria-label="Stop navigation">'+icon('close')+'</button>';$('#stop-live').onclick=()=>stopNavigation();}
}
function stopNavigation(clearMessage=true){tracker.stop();state.navigating=false;locating=false;firstFix=false;offRouteSamples=0;state.lastSpoken=-1;$('#navigation-banner').hidden=true;window.speechSynthesis?.cancel();if(clearMessage)locationMessage('');if($('#start-navigation'))$('#start-navigation').innerHTML=icon('navigate')+'Start walking';}
window.addEventListener('pagehide',()=>tracker.stop());
setInterval(()=>{if(state.navigating&&lastFixTime&&Date.now()-lastFixTime>20000){locationMessage('GPS signal is stale. Waiting for a new location before giving turns.');$('#navigation-banner').hidden=true;}},5000);
function chatMessage(text,who='assistant'){const d=document.createElement('div');d.className='chat-message '+who;d.textContent=text;$('#assistant-log').append(d);$('#assistant-log').scrollTop=$('#assistant-log').scrollHeight;return d;}
function routeExplanation(){if(!route?.found)return route?.reason||'Choose a route first.';if(route.samePlace)return 'Your starting point and destination are the same building.';return 'About '+Math.max(1,Math.round(route.seconds/60))+' minutes ('+Math.round(route.meters)+' m) from '+route.start.name+' to '+route.end.name+(route.label?', '+route.label:'.')+'. '+(state.avoidStairs?'Mapped stairs are excluded. ':'')+'Your construction areas are excluded.'+(route.indoor?' The route includes building passages, so doors need to be open.':'')+(route.endEntrance?.kind==='nearby_path'?' Arrival is at a nearby mapped path because OSM has no connected entrance.':'');}
async function askAssistant(text){
 text=text.trim();if(!text||$('#assistant-send').disabled)return;$('#assistant-input').value='';chatMessage(text,'user');const pending=chatMessage('Finding your way…');$('#assistant-send').disabled=true;
 try{const intent=await aiIntent(text,graph.places,{origin:state.origin,destination:state.destination,avoidStairs:state.avoidStairs},{key:sessionStorage.getItem('camp-path-gemini-key'),model:localStorage.getItem('camp-path-model')||'gemini-2.5-flash',signal:AbortSignal.timeout(25000)});
  if(intent.action==='route'){stopNavigation();state.origin=intent.from;state.destination=intent.to;state.avoidStairs=intent.avoidStairs;$('#avoid-stairs').checked=state.avoidStairs;syncInputs();if(state.origin==='GPS'&&!state.gps){useLocation(false);pending.textContent='Allow location access and I’ll route you to '+getPlace(state.destination).name+'.';}else{render();pending.textContent=routeExplanation();}}
  else pending.textContent=intent.action==='explain'?routeExplanation():intent.message;
 }catch(e){pending.textContent=e.message;}finally{$('#assistant-send').disabled=false;updateAIStatus();$('#assistant-log').scrollTop=$('#assistant-log').scrollHeight;}
}
load().catch(e=>{$('#route-result').innerHTML=`<div class="error-state"><h3>Couldn’t load campus</h3><p>${esc(e.message)}</p><button class="button" onclick="location.reload()">Try again</button></div>`;console.error(e);});
