import test from 'node:test';import assert from 'node:assert/strict';
import {basicIntent,aiIntent,validateIntent} from '../dist/assistant.mjs';
import {createLocationTracker,usablePosition} from '../dist/location.mjs';
const places=[{id:'goodwin',name:'Goodwin Hall',aliases:['Goodwin']},{id:'dds',name:'Data and Decision Sciences Building',aliases:['DDS']}];
test('basic matching is useful without pretending to be AI',()=>{assert.deepEqual(basicIntent('Take me from Goodwin to DDS, avoiding stairs',places,{}),{action:'route',from:'goodwin',to:'dds',avoidStairs:true});assert.equal(basicIntent('Explain my route',places,{}).action,'explain');assert.equal(basicIntent('go to nowhere',places,{}).action,'help');});
test('AI uses the existing catalog and rejects invented route IDs',async()=>{
 let request;const result=await aiIntent('Goodwin to DDS',places,{origin:'goodwin'},{key:'test-only-key',fetcher:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"action":"route","from":"goodwin","to":"dds","avoidStairs":true}'}]}}]})};}});
 assert.equal(result.provider,'gemini');assert.equal(request.options.headers['x-goog-api-key'],'test-only-key');assert.ok(!request.url.includes('test-only-key'));
 assert.throws(()=>validateIntent({action:'route',from:'imaginary',to:'dds'},places));
});
test('AI reports provider errors, malformed responses, and outages',async()=>{
 await assert.rejects(()=>aiIntent('x',places,{}, {key:'test',fetcher:async()=>({ok:false,status:429})}),/usage limit/);
 await assert.rejects(()=>aiIntent('x',places,{}, {key:'test',fetcher:async()=>({ok:true,json:async()=>({})})}),/unreadable/);
 await assert.rejects(()=>aiIntent('x',places,{}, {key:'test',fetcher:async()=>{throw Error('offline');}}),/connection/);
});
test('live location starts a high-accuracy watch and stops callbacks after cleanup',()=>{
 let onPosition,onError,settings,stops=[],seen=[];const geo={watchPosition(p,e,s){onPosition=p;onError=e;settings=s;return 7;},clearWatch(id){stops.push(id);}};
 const t=createLocationTracker(geo,{onPosition:p=>seen.push(p),onError:e=>seen.push(e)});t.start();assert.equal(t.active,true);assert.equal(settings.enableHighAccuracy,true);
 onPosition({coords:{latitude:1}});assert.equal(seen.length,1);t.stop();assert.deepEqual(stops,[7]);onPosition({});onError({});assert.equal(seen.length,1);
});
test('missing GPS and invalid or stale positions are handled',()=>{
 let error;createLocationTracker(null,{onPosition(){},onError:e=>error=e}).start();assert.equal(error.code,0);
 assert.equal(usablePosition({coords:{longitude:-80.4,latitude:37.2,accuracy:5},timestamp:Date.now()}),true);
 assert.equal(usablePosition({coords:{longitude:NaN,latitude:37,accuracy:5}}),false);
 assert.equal(usablePosition({coords:{longitude:-80,latitude:37,accuracy:5},timestamp:Date.now()-60000}),false);
});

test('assistant recognizes second-floor DDS entry and rejects an invented entrance',()=>{
 const catalog=[places[0],{...places[1],entranceChoices:[{id:'dds-side',label:'Side entrance'},{id:'dds-second-floor',label:'Second-floor entrance',floor:'2'}]}];
 const intent=basicIntent('Take me from Goodwin to DDS second floor',catalog,{origin:'goodwin',destination:'dds',avoidStairs:true});
 assert.equal(intent.destinationEntrance,'dds-second-floor');assert.equal(validateIntent(intent,catalog).destinationEntrance,'dds-second-floor');
 assert.equal(basicIntent('Use the second floor entrance',catalog,{origin:'goodwin',destination:'dds',avoidStairs:true}).destinationEntrance,'dds-second-floor');
 assert.throws(()=>validateIntent({...intent,destinationEntrance:'imaginary-floor-9'},catalog));
});
