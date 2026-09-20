/** Presentation and cue timing only: every maneuver comes from the OSM route. */
export function distanceText(meters,{spoken=false}={}){
 const m=Math.max(0,Number(meters)||0);
 if(m<5)return spoken?'a few meters':'< 5 m';
 if(m>=1000)return (m/1000).toFixed(1)+(spoken?' kilometers':' km');
 const rounded=Math.round(m/(m<100?5:10))*(m<100?5:10);
 return rounded+(spoken?' meters':' m');
}
export function spokenText(text){
 return String(text).replace(/\bDDS\b/g,'Data and Decision Sciences').replace(/\bNCB\b/g,'Classroom Building').replace(/\bVT\b/g,'Virginia Tech').replace(/\s*[·→]\s*/g,', ').replace(/\s+/g,' ').trim();
}
export function arrivalText(route,{arrived=false}={}){
 const name=route.end.name,entrance=route.endEntrance;
 if(entrance?.kind==='nearby_path')return `${arrived?'You have reached':'Finish at'} the mapped path near ${name}. The entrance is not mapped; look for the building entrance.`;
 if(route.journeyId==='turner-newman'&&route.end.id==='VT-NEWMAN-LIB')return `${arrived?'You are near':'Finish at'} the bridge elevator inside ${name}. GPS may be unreliable indoors; check the building signs.`;
 const label=entrance?.entrance_name&&entrance.entrance_name!=='Mapped entrance'?entrance.entrance_name.toLowerCase():'mapped entrance';
 return `${arrived?'You are near':'Finish at'} the ${label} of ${name}.`;
}
export function routeNarration(route){
 if(!route?.found)return [route?.reason||'Choose a route first.'];
 if(route.samePlace)return ['Your starting point and destination are the same building.'];
 return [
  `Walking to ${route.end.name}. About ${Math.max(1,Math.round(route.seconds/60))} minutes, ${distanceText(route.meters,{spoken:true})}.`,
  ...(route.indoor?['This route uses indoor passages. Doors must be open.']:[]),
  ...route.steps.map(s=>`${s.text} for ${distanceText(s.meters,{spoken:true})}.`),
  arrivalText(route)
 ].map(spokenText);
}
export function currentGuidance(route,progress,accuracy=0){
 const index=progress.stepIndex,step=route.steps[index],next=route.steps[index+1];
 if(!step)return null;
 const left=Math.max(0,step.end-progress.along),near=!!next&&left<=8&&accuracy<=15;
 const instruction=next?(near?next.text:`In ${distanceText(left)}, ${next.text[0].toLowerCase()+next.text.slice(1)}`):`Continue toward ${route.end.name}`;
 let speech=next?(near?next.text:`Continue for ${distanceText(left,{spoken:true})}. Then ${next.text[0].toLowerCase()+next.text.slice(1)}.`):`Continue for ${distanceText(progress.remaining,{spoken:true})}. ${arrivalText(route)}`;
 // Give closely spaced turns together, before the walker reaches them.
 const after=route.steps[index+2];
 if(near&&next.meters<=20&&after)speech+=` Then, after ${distanceText(next.meters,{spoken:true})}, ${after.text[0].toLowerCase()+after.text.slice(1)}.`;
 return {index,nextIndex:next?index+1:null,left,near,title:instruction,icon:next?.icon||step.icon,speech:spokenText(speech)};
}
export function createCueTracker(){
 const said=new Set();let started=false,lastAt=-Infinity;
 return {
  reset(){said.clear();started=false;lastAt=-Infinity;},
  next(route,progress,accuracy,now=Date.now()){
   if(accuracy>25||progress.offRoute>Math.max(15,accuracy))return null;
   const g=currentGuidance(route,progress,accuracy);if(!g)return null;
   if(!started){started=true;lastAt=now;
    if(g.near)said.add(`turn:${g.nextIndex}`);
    else if(g.nextIndex!==null&&g.left<=35)said.add(`advance:${g.nextIndex}`);
    return (progress.along<5&&!g.near?spokenText(route.steps[0].text)+'. ':'')+g.speech;
   }
   const key=g.nextIndex===null?'arrival-approach':`${g.near?'turn':'advance'}:${g.nextIndex}`;
   if(said.has(key)||!g.near&&g.left>35||now-lastAt<5000)return null;
   // Never replay a passed maneuver when GPS jitters back across its boundary.
   if(!g.near&&said.has(`turn:${g.nextIndex}`))return null;
   said.add(key);lastAt=now;return g.speech;
  }
 };
}

/** Speak short utterances in sequence; cancellation invalidates old callbacks. */
export function createSpeaker(synthesis,makeUtterance,{onState=()=>{},onError=()=>{}}={}){
 let generation=0,active=false;
 const stop=()=>{generation++;active=false;synthesis?.cancel();onState(false);};
 return {stop,get active(){return active;},speak(lines,{voice,rate=0.95}={}){
  stop();if(!synthesis){onError('Spoken directions aren’t supported in this browser.');return;}
  const queue=(Array.isArray(lines)?lines:[lines]).map(spokenText).filter(Boolean),current=generation;
  const next=()=>{if(current!==generation)return;if(!queue.length){active=false;onState(false);return;}
   const utterance=makeUtterance(queue.shift());utterance.lang='en-US';utterance.rate=rate;if(voice)utterance.voice=voice;
   utterance.onend=next;utterance.onerror=()=>{if(current!==generation)return;stop();onError('Voice playback stopped. Tap the speaker to try again.');};
   active=true;onState(true);synthesis.speak(utterance);
  };next();
 }};
}
