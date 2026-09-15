import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import { buildDetailPreviews } from '../build-detail-previews.mjs';
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;

test('bundled descriptions and people load synchronously from one bucket without marking media complete', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'aparatchi-previews-'));
  try {
    const bundle = JSON.parse(fs.readFileSync('src/catalogBootstrap.json','utf8'));
    await buildDetailPreviews(bundle, root);
    let reads = 0;
    const previewExports = {};
    vm.runInNewContext(compile(fs.readFileSync(path.join(root,'src/detailPreviews.generated.ts'),'utf8')), {
      exports:previewExports, require: name => {reads++;return JSON.parse(fs.readFileSync(path.join(root,'src',name),'utf8'));},
    });
    assert.equal(reads,0, 'startup must not evaluate story/cast buckets');
    const exports = {};
    const config = new Proxy({CONTENT_REPOSITORY_BASES:['https://example.test/']},{get:(o,k)=>o[k] || 'https://example.test/'});
    vm.runInNewContext(compile(fs.readFileSync('src/contentService.ts','utf8')), {
      exports, URL, console, setTimeout, clearTimeout,
      require:name => {
        if(name==='./detailPreviews.generated') return previewExports;
        if(name==='./catalogBootstrap.json') return bundle;
        if(name==='./config') return config;
        if(name==='./data') return {CATALOG:[],VERIFIED_IRANIAN_SCHEDULE:[]};
        if(name==='expo-file-system/legacy') return {};
        throw Error(name);
      },
    });
    const original = bundle.items.find(i=>i.overview && i.people?.length && i.detailPath);
    const summary = {...original,overview:'',people:[],detailLoaded:false,downloads:[]};
    const result = exports.getCatalogItemPreview(summary);
    assert.equal(reads,1);
    assert.equal(result.overview,original.overview);
    assert.ok(result.people.length > 0 && result.people.every(p=>p.id));
    assert.equal(result.detailLoaded,false);
    assert.equal(result.downloads,summary.downloads);
    const newer = {...summary,detailPath:'catalog-items/new-revision.json'};
    assert.equal(exports.getCatalogItemPreview(newer),newer,'never use stale metadata for a new immutable version');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('refreshes coalesce and do not move rows during scrolling', () => {
  let now=1000, timer; const exports={}; const calls=[];
  vm.runInNewContext(compile(fs.readFileSync('src/catalogInteraction.ts','utf8')), {
    exports, Date:{now:()=>now}, setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},
  });
  exports.markCatalogInteraction();
  exports.commitCatalogWhenIdle(()=>calls.push('old'));
  exports.commitCatalogWhenIdle(()=>calls.push('new'));
  assert.deepEqual(calls,[]);
  now=1400;exports.markCatalogInteraction();timer();assert.deepEqual(calls,[]);
  now=1901;timer();assert.deepEqual(calls,['new']);
});

test('details retain one cast tree, and grid restoration cannot override a new drag', () => {
  const app=fs.readFileSync('App.tsx','utf8');
  const detail=app.slice(app.indexOf('function DetailModal('),app.indexOf('function PersonProfileModal('));
  assert.equal((detail.match(/<PeopleSection /g)||[]).length,1);
  assert.ok(!detail.includes('{!detailBodyReady ? ('));
  const grid=app.slice(app.indexOf('function CatalogListScreen('),app.indexOf('function SimpleSearchScreen('));
  assert.ok(!grid.includes('.scrollToOffset('));
  assert.ok(grid.includes('contentOffset={initialContentOffset}'));
  const rail=app.slice(app.indexOf('const HorizontalCatalog ='),app.indexOf('const StarPersonButton ='));
  assert.ok(rail.includes('initialNumToRender={3}'));
  assert.ok(!rail.includes('initialNumToRender={10}'));
});
