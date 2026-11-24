import test from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL('../../'+path, import.meta.url),'utf8');
const app=read('App.tsx'), service=read('src/contentService.ts');
const extract=(s,from,to)=>{const a=s.indexOf(from), b=s.indexOf(to,a);assert.ok(a>=0 && b>a);return stripTypeScriptTypes(s.slice(a,b).replace(/^export /gm,''));};
const prepare=extract(service,'export function prepareLiveContent','export async function loadLiveContent');
const manifest={clientRevision:'published-B'};
for(const online of [false,true]) test(`no revision, no big recovery download or false success (online=${online})`,async()=>{
 let requests=0;
 const start=vm.runInNewContext(prepare+';prepareLiveContent',{
  fetchRemoteManifest:async required=>{assert.equal(required,true);requests++;throw Error('source unreachable');},
  loadLiveContent:assert.fail,loadBootstrapContent:assert.fail});
 assert.equal(await start(Promise.resolve(online))({}),null); assert.equal(requests,Number(online));
});
for(const live of [true,false]) test(`one GitHub revision pins delta and recovery (live usable=${live})`,async()=>{
 const base={clientRevision:'A',updatedAt:'old'}, fresh={clientRevision:'published-B'};let probes=0, recoveries=0;
 const start=vm.runInNewContext(prepare+';prepareLiveContent',{
  fetchRemoteManifest:async required=>{assert.equal(required,true);probes++;return manifest;},
  loadLiveContent:async(b,p)=>{assert.equal(b,base);assert.equal(await p,manifest);return live?fresh:null;},
  loadBootstrapContent:async(t,m)=>{assert.equal(t,'old');assert.equal(m,manifest);recoveries++;return fresh;}});
 assert.equal(await start(Promise.resolve(true))(base),fresh);assert.equal(probes,1);assert.equal(recoveries,Number(!live));
});
test('a stale CDN cannot win an automatic check when Raw fails',async()=>{
 const urls=['https://raw.githubusercontent.com/u/r/main/manifest','https://cdn.test/manifest'];const called=[];
 const fetchManifest=vm.runInNewContext(extract(service,'const fetchRemoteManifest =','/**\n * Apply the current cumulative')+';fetchRemoteManifest',{
  REMOTE_CONTENT_MANIFEST_URL:urls[0],remoteRepositoryUrlCandidates:()=>urls,AbortController,setTimeout,clearTimeout,
  fetch:async url=>{called.push(url);return url.startsWith(urls[0])?{ok:false}:{ok:true,json:async()=>({revision:'stale'})};}});
 assert.equal(await fetchManifest(true),null);assert.equal(called.length,1);assert.ok(called[0].startsWith(urls[0]));
});
test('reconnect wakes sync once, with no duplicate from an old startup sample or after disposal',async()=>{
 let listener,seed,removed=false,runs=0;
 const watch=vm.runInNewContext(extract(app,'const watchCatalogReconnect','const isNetworkFailure')+';watchCatalogReconnect',{
  Network:{addNetworkStateListener:f=>(listener=f,{remove:()=>{removed=true;}}),getNetworkStateAsync:()=>new Promise(r=>{seed=r;})}});
 const stop=watch(()=>runs++);listener({isConnected:false});seed({isConnected:true});await new Promise(setImmediate);
 listener({isConnected:true});listener({isConnected:true});assert.equal(runs,1);
 stop();listener({isConnected:false});listener({isConnected:true});assert.ok(removed);assert.equal(runs,1);
});
