/** OSM pedestrian routing. Geometry is never invented between nearby nodes. */
export function haversine(a,b){const r=Math.PI/180,x=Math.sin((b[1]-a[1])*r/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin((b[0]-a[0])*r/2)**2;return 6371000*2*Math.asin(Math.sqrt(Math.min(1,x)));}
export const pathLength=c=>c.slice(1).reduce((s,p,i)=>s+haversine(c[i],p),0);
export function projectPoint(point,line){let best=null,along=0;for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],sx=Math.cos(point[1]*Math.PI/180),dx=(b[0]-a[0])*sx,dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*sx*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1))),coordinates=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],meters=haversine(point,coordinates),part=haversine(a,b);if(!best||meters<best.meters)best={coordinates,meters,index:i,t,along:along+t*part};along+=part;}return best;}
const nodeId=n=>'N-OSM-'+n;
export function buildGraph(data){
 const g={nodes:new Map(),edges:[],adj:new Map(),buildings:new Map(),entrances:new Map(),places:[],metadata:data.metadata||{},closures:data.closures?.features||[]};
 function add(e,reverse=false){const from=reverse?e.to_node:e.from_node,to=reverse?e.from_node:e.to_node;if(!g.adj.has(from))g.adj.set(from,[]);g.adj.get(from).push({...e,from,to,coordinates:reverse?[...e.coordinates].reverse():e.coordinates});}
 for(const f of data.paths.features){const p=f.properties,c=f.geometry.coordinates,e={...p,id:p.segment_id,coordinates:c,meters:pathLength(c)};g.nodes.set(p.from_node,{coordinates:c[0]});g.nodes.set(p.to_node,{coordinates:c.at(-1)});g.edges.push(e);if(p.oneway!=='-1')add(e);if(p.oneway!=='yes'&&p.oneway!=='1')add(e,true);}
 for(const f of data.entrances.features){const p={...f.properties,coordinates:f.geometry.coordinates};g.entrances.set(p.entrance_id,p);}
 for(const f of data.buildings.features){const b={...f.properties,coordinates:f.geometry.coordinates};g.buildings.set(b.building_id,b);const entries=[...g.entrances.values()].filter(e=>e.building_id===b.building_id&&g.nodes.has(e.node_id));g.places.push({...b,id:b.building_id,building:b.building_id,type:'building',entries,entranceChoices:g.metadata.entrance_choices?.[b.building_id]||[]});}
 for(const f of data.pois.features){const p=f.properties,b=g.places.find(b=>b.id===p.building_id);if(b)g.places.push({...b,...p,id:p.poi_id,coordinates:b.coordinates,entries:b.entries,type:p.category});}
 return g;
}
export function resolvePlace(g,query){const q=String(query||'').trim().toLowerCase();return g.places.find(p=>[p.id,p.name].some(v=>String(v).toLowerCase()===q))||g.places.find(p=>(p.aliases||[]).some(v=>String(v).toLowerCase()===q))||null;}
function eligible(e,{avoidStairs=true,closedAssets=[]}={}){return !e.closed&&!closedAssets.includes(e.id)&&!(avoidStairs&&(e.steps||e.highway==='steps'));}
class Heap{constructor(){this.q=[];}push(x){let i=this.q.length;this.q.push(x);while(i){const p=(i-1)>>1;if(this.q[p][0]<=x[0])break;this.q[i]=this.q[p];i=p;}this.q[i]=x;}pop(){const top=this.q[0],last=this.q.pop();if(this.q.length){let i=0;while(i*2+1<this.q.length){let j=i*2+1;if(j+1<this.q.length&&this.q[j+1][0]<this.q[j][0])j++;if(last[0]<=this.q[j][0])break;this.q[i]=this.q[j];i=j;}this.q[i]=last;}return top;}get length(){return this.q.length;}}
function search(g,starts,ends,options){
 const target=new Set(ends),dist=new Map(),prev=new Map(),heap=new Heap(),visited=new Set();
 for(const s of starts){if(!g.nodes.has(s.node))continue;dist.set(s.node,s.cost||0);heap.push([s.cost||0,s.node]);}
 let end;
 while(heap.length){const [d,n]=heap.pop();if(visited.has(n))continue;visited.add(n);if(target.has(n)){end=n;break;}for(const e of g.adj.get(n)||[]){if(!eligible(e,options)||visited.has(e.to))continue;const nd=d+e.meters;if(nd<(dist.get(e.to)??Infinity)){dist.set(e.to,nd);prev.set(e.to,e);heap.push([nd,e.to]);}}}
 if(end===undefined)return null;
 const legs=[];let n=end;while(prev.has(n)){const e=prev.get(n);legs.unshift(e);n=e.from;}return {legs,startNode:n,endNode:end};
}
function scopedJourney(g,from,to){for(const j of g.metadata.journeys||[]){if(j.from.includes(from)&&j.to.includes(to))return j;if(j.to.includes(from)&&j.from.includes(to))return {...j,start_node:j.end_node,end_node:j.start_node,via:[...j.via].reverse()};}return null;}
function bearing(a,b){const r=Math.PI/180,x=(b[0]-a[0])*r;return (Math.atan2(Math.sin(x)*Math.cos(b[1]*r),Math.cos(a[1]*r)*Math.sin(b[1]*r)-Math.sin(a[1]*r)*Math.cos(b[1]*r)*Math.cos(x))*180/Math.PI+360)%360;}
export function makeSteps(legs){
 const steps=[];let cumulative=0;
 for(let i=0;i<legs.length;i++){
  const e=legs[i],prior=legs[i-1];const name=e.name|| (e.highway==='steps'?'the stairs':e.is_indoor?'the mapped passage':e.highway==='service'?'the access road':'the campus path');
  const a=prior?bearing(prior.coordinates.at(-2),prior.coordinates.at(-1)):null,b=bearing(e.coordinates[0],e.coordinates[1]),delta=a===null?0:((b-a+540)%360)-180;
  const turn=Math.abs(delta)>38 && (prior?.meters>4||e.meters>4);
  const change=prior&&((e.name||'')!==(prior.name||'')||e.steps!==prior.steps||e.is_indoor!==prior.is_indoor);
  if(!steps.length||turn||change){let text,icon='arrow-up';if(!steps.length)text='Head along '+name;else if(e.is_indoor&&!prior.is_indoor){text='Enter '+name;icon='navigate';}else if(turn){text=(delta>0?'Turn right onto ':'Turn left onto ')+name;icon=delta>0?'right':'left';}else text='Continue on '+name;
   steps.push({text,icon,name,meters:0,at:cumulative,end:cumulative,coordinates:e.coordinates[0]});}
  const s=steps.at(-1);s.meters+=e.meters;cumulative+=e.meters;s.end=cumulative;
 }
 return steps;
}
export function findRoute(g,from,to,options={}){
 const start=from==='GPS'?{id:'GPS',name:'Your location',coordinates:options.gps,entries:[]}:resolvePlace(g,from),end=resolvePlace(g,to);
 const fail=reason=>({found:false,reason,legs:[],start,end});
 if(!start||!end)return fail('Choose a starting point and destination from the campus list.');
 const startChoice=start.entranceChoices?.find(c=>c.id===options.originEntrance),endChoice=end.entranceChoices?.find(c=>c.id===options.destinationEntrance);
 if((options.originEntrance&&!startChoice)||(options.destinationEntrance&&!endChoice))return fail('The selected entrance is not mapped for this building. Choose an available entrance.');
 const startEntries=startChoice?start.entries.filter(e=>e.node_id===startChoice.node_id):start.entries;
 const endEntries=endChoice?end.entries.filter(e=>e.node_id===endChoice.node_id):end.entries;
 if((startChoice&&!startEntries.length)||(endChoice&&!endEntries.length))return fail('The selected entrance is not connected to the campus map.');
 if(end.under_construction)return fail(`${end.name} is under construction. Choose an open campus destination.`);
 if(start.id===end.id||start.building&&start.building===end.building)return {found:true,samePlace:true,legs:[],steps:[],meters:0,seconds:0,start,end};
 let result,journey=from==='GPS'?null:scopedJourney(g,start.id,end.id),snap=null;
 if(journey){journey={...journey,start_node:startChoice?.osm_node_id||journey.start_node,end_node:endChoice?.osm_node_id||journey.end_node};if(journey.id==='goodwin-dds'){const choice=endChoice||startChoice;if(choice)journey.label='via the north path · DDS '+choice.label.toLowerCase();}}
 if(journey){const points=[journey.start_node,...journey.via,journey.end_node].map(nodeId);let legs=[];for(let i=0;i<points.length-1;i++){const part=search(g,[{node:points[i]}],[points[i+1]],options);if(!part)return fail('The requested campus passage is unavailable with these route settings. Try another destination or allow mapped stairs.');legs.push(...part.legs);}result={legs,startNode:points[0],endNode:points.at(-1)};}
 else{
  let starts=startEntries.map(e=>({node:e.node_id}));
  if(from==='GPS'){
   if(!options.gps||!options.gps.every(Number.isFinite))return fail('Waiting for a usable GPS location.');
   for(const e of g.edges){if(!eligible(e,options))continue;const p=projectPoint(options.gps,e.coordinates);if(!snap||p.meters<snap.meters)snap={...p,edge:e};}
   if(!snap||snap.meters>50)return fail('You’re more than 50 m from a mapped campus path. Move closer or choose a building as your starting point.');
   starts=[];if(snap.edge.oneway!=='yes'&&snap.edge.oneway!=='1')starts.push({node:snap.edge.from_node,cost:haversine(snap.coordinates,snap.edge.coordinates[0])});if(snap.edge.oneway!=='-1')starts.push({node:snap.edge.to_node,cost:haversine(snap.coordinates,snap.edge.coordinates.at(-1))});
  }
  result=search(g,starts,endEntries.map(e=>e.node_id),options);
  if(!result)return fail(options.avoidStairs===false?'No connected walking route is mapped. Construction or restricted paths may block the way.':'No route avoiding mapped stairs is connected here. You can turn off “Avoid stairs” to check other mapped paths.');
  if(snap){const c=g.nodes.get(result.startNode).coordinates,m=haversine(snap.coordinates,c);if(m>.05)result.legs.unshift({...snap.edge,id:'GPS-PROJECTION',from:'GPS',to:result.startNode,coordinates:[snap.coordinates,c],meters:m});}
 }
 if(journey?.required_ways?.some(id=>!result.legs.some(e=>e.source_way_id===id||e.source_way_ids?.includes(id))))return fail('The requested campus passage is unavailable with these route settings.');
 const legs=result.legs.map(e=>({...e,seconds:e.meters/1.25})),meters=legs.reduce((s,e)=>s+e.meters,0);
 const entrance=(place,n,choice)=>({...place.entries?.find(e=>e.node_id===n),coordinates:g.nodes.get(n)?.coordinates,kind:place.entries?.find(e=>e.node_id===n)?.kind||'entrance',...(choice?{entrance_name:choice.label,floor:choice.floor,floor_source:choice.floor_source,choice_id:choice.id}:{})});
 return {found:true,start,end,legs,meters,seconds:meters/1.25,steps:makeSteps(legs),startEntrance:entrance(start,result.startNode,startChoice),endEntrance:entrance(end,result.endNode,endChoice),label:journey?.label||(endChoice?'to DDS · '+endChoice.label.toLowerCase():startChoice?'from DDS · '+startChoice.label.toLowerCase():null),journeyId:journey?.id,gpsSnap:snap?{meters:snap.meters,coordinates:snap.coordinates}:null,indoor:legs.some(e=>e.is_indoor)};
}
export function routeProgress(route,point){
 if(!route?.found||!route.legs.length)return null;
 let best=null,offset=0;
 for(const e of route.legs){const p=projectPoint(point,e.coordinates);if(!best||p.meters<best.offRoute)best={offRoute:p.meters,along:offset+p.along,coordinates:p.coordinates};offset+=e.meters;}
 const stepIndex=route.steps.findIndex(s=>s.end>best.along+5);
 return {...best,remaining:Math.max(0,route.meters-best.along),stepIndex:stepIndex<0?route.steps.length-1:stepIndex,arrivalDistance:haversine(point,route.legs.at(-1).coordinates.at(-1))};
}
export function navigationDecision(progress,accuracy,offRouteSamples=0){
 if(!progress||!Number.isFinite(accuracy)||accuracy>45)return {action:'wait',offRouteSamples:0};
 if(progress.remaining<22&&progress.arrivalDistance<Math.max(12,Math.min(20,accuracy)))return {action:'arrive',offRouteSamples:0};
 const off=progress.offRoute>Math.max(25,accuracy*1.5);const samples=off?offRouteSamples+1:0;
 return {action:samples>=3?'reroute':'follow',offRouteSamples:samples};
}
