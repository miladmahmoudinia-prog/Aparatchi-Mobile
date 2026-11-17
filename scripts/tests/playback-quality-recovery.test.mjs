import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../App.tsx',import.meta.url),'utf8');
const body=app.split('  const switchQuality = async (nextSource: PlaybackSource) => {')[1].split('\n  const toggleOrientation')[0].replace(/\n  };\s*$/, '');
function harness({playing=false,error='',status='readyToPlay',replace=async()=>{}}={}) {
 const calls=[];
 const lock={current:false};
 const ctx={activeSource:{id:'old',url:'old.mp4'},switchingQuality:false,playbackRetryInFlightRef:lock,playbackError:error,
  player:{playing,status,currentTime:42,pause:()=>calls.push('pause'),play:()=>calls.push('play'),replaceAsync:async url=>{calls.push(['replace',url]);await replace();}},
  latestTimeRef:{current:42},clearControlsTimer(){},scheduleControlsHide(){}};
 for(const name of ['setSwitchingQuality','setPlaybackError','setPlaybackAttempt','setFirstFrameReady','setCurrentTime','setActiveSource','setQualityExpanded','setSettingsOpen','setControlsVisible']) ctx[name]=v=>calls.push([name,v]);
 const fn=vm.runInNewContext(`(async(nextSource)=>{${body}})`,ctx);
 return {calls,lock,ctx,run:()=>fn({id:'new',url:'new.mp4'})};
}
test('quality selection after native error starts playback and preserves position',async()=>{const h=harness({status:'error'});await h.run();assert.ok(h.calls.includes('play'));assert.equal(h.ctx.player.currentTime,42);assert.equal(h.lock.current,false);});
test('quality selection after reported failure starts playback',async()=>{const h=harness({error:'HTTP 421'});await h.run();assert.ok(h.calls.includes('play'));});
test('ordinary quality selection preserves an intentional pause',async()=>{const h=harness();await h.run();assert.ok(!h.calls.includes('play'));});
test('replacement failure is visible and releases shared retry lock',async()=>{const h=harness({playing:true,replace:async()=>{throw Error('failed');}});await h.run();assert.ok(h.calls.some(c=>Array.isArray(c)&&c[0]==='setPlaybackError'&&c[1]));assert.ok(!h.calls.includes('play'));assert.equal(h.lock.current,false);});
test('double quality taps cause only one replacement',async()=>{let release;const h=harness({replace:()=>new Promise(r=>{release=r;})});const first=h.run();await h.run();assert.equal(h.calls.filter(c=>Array.isArray(c)&&c[0]==='replace').length,1);release();await first;});
test('quality change cannot overlap retry',async()=>{const h=harness();h.lock.current=true;await h.run();assert.equal(h.calls.length,0);});
