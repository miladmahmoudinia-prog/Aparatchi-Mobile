import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../App.tsx',import.meta.url),'utf8');
const body=app.split('    setStartupSlow(false);')[1].split('\n  }, [activeSource.url, firstFrameReady, networkOffline, playbackError, playbackAttempt]);')[0];
function run(overrides={}) {
 const events=[];let timer;let cleared=false;
 const ctx={firstFrameReady:false,networkOffline:false,playbackError:'',setStartupSlow:v=>events.push(['slow',v]),setControlsVisible:v=>events.push(['controls',v]),setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{cleared=true;},...overrides};
 const cleanup=vm.runInNewContext(`(()=>{${body}})()`,ctx);
 return {events,fire:()=>timer?.(),cleanup,hasTimer:()=>!!timer,isCleared:()=>cleared};
}
test('slow preparation does not become a playback error or replace the source',()=>{const h=run();h.fire();assert.deepEqual(h.events,[['slow',true],['controls',true]]);h.cleanup();assert.ok(h.isCleared());});
for(const state of [{firstFrameReady:true},{networkOffline:true},{playbackError:'HTTP 421'}]) test(`no slow timer for ${JSON.stringify(state)}`,()=>{assert.equal(run(state).hasTimer(),false);});
