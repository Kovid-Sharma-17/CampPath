import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSteps,routeProgress,navigationDecision} from '../dist/router.mjs';
import {arrivalText,routeNarration,currentGuidance,createCueTracker,createSpeaker} from '../dist/guidance.mjs';

const route={found:true,end:{id:'dds',name:'DDS'},endEntrance:{entrance_name:'Second-floor entrance'},meters:125,seconds:100,steps:[
 {text:'Head north along the campus path',at:0,end:80,meters:80,icon:'arrow-up'},
 {text:'Turn right onto the campus path',at:80,end:95,meters:15,icon:'right'},
 {text:'Enter the indoor passage',at:95,end:125,meters:30,icon:'navigate'}
]};
const progress=along=>({along,stepIndex:along<80?0:along<95?1:2,remaining:125-along,offRoute:0});
test('route narration includes distances, expanded names and the selected entrance',()=>{
 const lines=routeNarration(route).join(' ');
 assert.match(lines,/80 meters/);assert.match(lines,/15 meters/);assert.match(lines,/Data and Decision Sciences/);
 assert.match(lines,/second-floor entrance/);assert.doesNotMatch(lines,/\bDDS\b|\b0 meters\b/);
});
test('nearby-path arrival never claims the walker reached a building entrance',()=>{
 const approximate={...route,endEntrance:{kind:'nearby_path'}};
 assert.match(arrivalText(approximate,{arrived:true}),/mapped path near DDS/);
 assert.match(routeNarration(approximate).at(-1),/entrance is not mapped/);
 const bridge={...route,journeyId:'turner-newman',end:{id:'VT-NEWMAN-LIB',name:'Newman Library'}};
 assert.match(arrivalText(bridge),/bridge elevator/);
 assert.doesNotMatch(arrivalText({...bridge,end:{id:'turner',name:'Turner Place'}}),/bridge elevator/);
});
test('advance instructions specify distance and close turns are spoken together',()=>{
 assert.match(currentGuidance(route,progress(50),5).speech,/30 meters.*Then turn right/);
 const near=currentGuidance(route,progress(75),5);
 assert.equal(near.near,true);assert.match(near.speech,/Turn right.*after 15 meters, enter/);
 assert.equal(currentGuidance(route,progress(75),22).near,false);
});
test('live cues announce advance and turn once, tolerate jitter, and reset on reroute',()=>{
 const cues=createCueTracker();
 assert.ok(cues.next(route,progress(0),5,0));
 assert.equal(cues.next(route,progress(10),5,6000),null);
 assert.match(cues.next(route,progress(50),5,12000),/30 meters/);
 assert.equal(cues.next(route,progress(49),5,18000),null);
 assert.match(cues.next(route,progress(75),5,24000),/Turn right/);
 assert.equal(cues.next(route,progress(73),5,30000),null);
 assert.equal(cues.next(route,progress(60),5,36000),null);
 cues.reset();assert.ok(cues.next(route,progress(60),5,42000));
});
test('poor or off-route fixes do not consume the next spoken cue',()=>{
 const cues=createCueTracker();
 assert.equal(cues.next(route,progress(50),30,0),null);
 assert.equal(cues.next(route,{...progress(50),offRoute:30},5,6000),null);
 assert.ok(cues.next(route,progress(50),5,12000));
 assert.equal(navigationDecision({remaining:10,arrivalDistance:10,offRoute:0},35).action,'follow');
 assert.equal(navigationDecision({remaining:10,arrivalDistance:10,offRoute:0},5).action,'arrive');
});
test('step progress does not advance five meters before a turn',()=>{
 const r={found:true,meters:111.195,legs:[{meters:111.195,coordinates:[[0,0],[0,.001]]}],steps:[{end:50},{end:111.195}]};
 assert.equal(routeProgress(r,[0,.00043]).stepIndex,0);
 assert.equal(routeProgress(r,[0,.00046]).stepIndex,1);
});
test('written directions identify indoor entry, exit and stair transitions',()=>{
 const legs=[
 {coordinates:[[0,0],[0,.001]],meters:111,source_way_id:1},
 {coordinates:[[0,.001],[.001,.001]],meters:111,source_way_id:2,is_indoor:true,name:'Derring Hall passage'},
 {coordinates:[[.001,.001],[.001,.002]],meters:111,source_way_id:3},
 {coordinates:[[.001,.002],[.001,.003]],meters:111,source_way_id:4,highway:'steps'}
 ];
 const steps=makeSteps(legs);
 assert.match(steps[0].text,/Head north/);assert.match(steps[1].text,/right and enter Derring/);
 assert.match(steps[2].text,/Exit Derring Hall passage and turn left/);assert.match(steps[3].text,/Take the stairs/);
 assert.equal(steps.at(-1).end,444);
});
test('a gentle bend on the same OSM way is one instruction, a real corner remains',()=>{
 const legs=[{coordinates:[[0,0],[0,.001]],meters:100,source_way_id:1},{coordinates:[[0,.001],[.001,.002]],meters:140,source_way_id:1},{coordinates:[[.001,.002],[.002,.001]],meters:140,source_way_id:1}];
 const steps=makeSteps(legs);assert.equal(steps.length,2);assert.equal(steps[0].meters,240);assert.match(steps[1].text,/Turn right/);
});
test('speech uses short queued utterances and cancellation prevents stale playback',()=>{
 const spoken=[];let cancels=0;
 const speaker=createSpeaker({cancel(){cancels++;},speak(u){spoken.push(u);}},text=>({text}));
 speaker.speak(['First turn.','Second turn.']);assert.equal(spoken.length,1);assert.equal(speaker.active,true);
 spoken[0].onend();assert.equal(spoken.length,2);
 const old=spoken[1];speaker.speak('Route updated.');old.onend();assert.equal(spoken.length,3);
 speaker.stop();spoken[2].onend();assert.equal(spoken.length,3);assert.equal(speaker.active,false);assert.ok(cancels>=3);
});
