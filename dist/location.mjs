/** Small injectable controller so watch/stop/error behavior is testable without GPS hardware. */
export function createLocationTracker(geolocation,{onPosition,onError}){
 let watch=null,generation=0;
 return {start(){this.stop();if(!geolocation){onError({code:0,message:'This browser does not support live location.'});return;}const current=++generation;watch=geolocation.watchPosition(position=>{if(current===generation)onPosition(position);},error=>{if(current===generation)onError(error);},{enableHighAccuracy:true,maximumAge:1000,timeout:20000});},stop(){generation++;if(watch!==null)geolocation?.clearWatch(watch);watch=null;},get active(){return watch!==null;}};
}
export function usablePosition(position,now=Date.now()){
 const c=position?.coords;if(!c||![c.longitude,c.latitude,c.accuracy].every(Number.isFinite)||Math.abs(c.longitude)>180||Math.abs(c.latitude)>90||c.accuracy<0)return false;
 return !position.timestamp||now-position.timestamp<30000;
}
