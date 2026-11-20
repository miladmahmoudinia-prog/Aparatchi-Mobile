import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const timer = app.match(/startupFallbackTimer = setTimeout\(\(\) => \{([\s\S]*?)\n    \}, 4500\);/)[1];
for (const restored of [true,false]) test(`startup timer with restored snapshot=${restored}`,()=>{
 const items=Array.from({length:6720},(_,i)=>({id:i,title:`عنوان ${i}`}));
 const ref={current:{items:restored?items:[]}}; let dismissed=false;
 vm.runInNewContext(`(()=>{${timer}})()`,{contentRef:ref,startupDismissedRef:{current:false},startupFallbackContentRef:{current:{items:items.slice(0,6715)}},visibleLoadedContent:x=>x,loadedContentRevision:()=>'',contentRevisionRef:{},setContent:()=>{},setContentReady:()=>{},setContentResolved:()=>{},dismissStartup:()=>{dismissed=true;}});
 assert.equal(ref.current.items.length,restored?6720:6715); if(restored) for(const row of items.slice(-5)) assert.ok(ref.current.items.find(x=>x.title===row.title)); assert.ok(dismissed);
});
