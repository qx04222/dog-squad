(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MochiInput=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Mouse uses absolute aiming; touch/pen use anchored relative dragging.
  // Keeping this independent of DOM makes cancellation and multi-touch testable.
  function createPointerInput({minX=103,maxX=497,worldWidth=600,projection=.47+.53*663/800}={}){
    let active=null,lastClientX=0,dragX=170;
    const clamp=x=>Math.max(minX,Math.min(maxX,x));
    const valid=e=>Number.isFinite(e.clientX)&&Number.isFinite(e.bounds?.left)&&e.bounds.width>0;
    const absolute=e=>clamp(worldWidth/2+(((e.clientX-e.bounds.left)/e.bounds.width*worldWidth)-worldWidth/2)/projection);
    return {
      begin(e){
        if(!valid(e)||active!==null)return null;
        active=e.id;lastClientX=e.clientX;dragX=clamp(e.x);
        return e.type==='mouse'?absolute(e):dragX;
      },
      move(e){
        if(!valid(e))return null;
        if(e.type==='mouse'&&active===null)return absolute(e);
        if(active!==e.id)return null;
        if(e.type==='mouse')return absolute(e);
        dragX=clamp(dragX+(e.clientX-lastClientX)*worldWidth/e.bounds.width/projection);
        lastClientX=e.clientX;
        return dragX;
      },
      end(id,x){if(active!==id)return null;active=null;return clamp(x);},
      reanchor(x){if(Number.isFinite(x))dragX=clamp(x);},
      clear(){active=null;},
      owns(id){return active===id;},
      dragging(){return active!==null;}
    };
  }
  return {createPointerInput};
});
