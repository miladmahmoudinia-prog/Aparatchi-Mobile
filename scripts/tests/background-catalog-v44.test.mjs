import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import {stripTypeScriptTypes} from 'node:module';
const source = name => fs.readFileSync(name, 'utf8');
const js = name => stripTypeScriptTypes(source(name).replace(/^import .*;$/gm,'').replace(/export /g,''));
const snapshot = js('src/startupSnapshot.ts');
const manager = js('src/notificationManager.ts');
const catalog = h => ({items:[{id:'1'}],updatedAt:`2026-11-22T${h}:00Z`,clientRevision:h});
function disk() {
  const files = new Map();
  const FileSystem = {documentDirectory:'/',readDirectoryAsync:async()=>Array.from(files.keys(),p=>p.slice(1)),
    readAsStringAsync:async p=>files.get(p),writeAsStringAsync:async(p,v)=>files.set(p,v),
    moveAsync:async({from,to})=>{files.set(to,files.get(from));files.delete(from);}, deleteAsync:async p=>files.delete(p)};
  const restart = () => vm.runInNewContext(snapshot+';({saveStartupSnapshot, readStartupSnapshot})',{FileSystem});
  return {FileSystem,restart};
}
test('closed-app worker without subscriptions updates durable catalog; offline restart sees it', async()=>{
  let work;const d = disk(); const old = catalog('11:02'), fresh = catalog('12:45');let registered = false;
  const ctx = {FileSystem:d.FileSystem,Platform:{OS:'android'},Notifications:{setNotificationHandler(){},setNotificationChannelAsync(){},AndroidImportance:{HIGH:1}},
    TaskManager:{isTaskDefined:()=>false,defineTask:(_,cb)=>work=cb,isAvailableAsync:async()=>true,isTaskRegisteredAsync:async()=>false},
    BackgroundTask:{registerTaskAsync:async()=>{registered=true},BackgroundTaskResult:{Success:'ok',Failed:'fail'}},
    getBundledContent:()=>old,readStartupSnapshot:d.restart().readStartupSnapshot,loadCachedBootstrapContent:async()=>null,loadCachedLiveContent:async()=>null,
    loadLiveContent:async base=>{assert.equal(base.updatedAt,old.updatedAt);await d.restart().saveStartupSnapshot(fresh);return fresh;}};
  const init = vm.runInNewContext(manager+';initializeEpisodeAlertSystem',ctx); await init();assert.ok(registered);
  assert.equal(await work(),'ok');assert.equal((await d.restart().readStartupSnapshot(old.updatedAt)).updatedAt,fresh.updatedAt);
});
test('older late write and interrupted publication cannot roll back offline restart',async()=>{
  const d=disk(), fresh=catalog('12:45'), old=catalog('11:02');
  await d.restart().saveStartupSnapshot(fresh);await d.restart().saveStartupSnapshot(old);
  d.FileSystem.moveAsync=async()=>{throw Error('no space')};await assert.rejects(d.restart().saveStartupSnapshot(catalog('13:45')));
  assert.equal((await d.restart().readStartupSnapshot(old.updatedAt)).updatedAt,fresh.updatedAt);
});
test('first usable local screen never waits for network, even without a saved snapshot',()=>{
  const app=source('App.tsx'), start=app.indexOf('const snapshot = initialLoad ?'), end=app.indexOf('const online = await onlinePromise',start);
  assert.ok(start>=0 && end>start);assert.match(app.slice(start,end),/if \(initialLoad && contentRef.current.items.length\) dismissStartup\(\);/);
});
