import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const service = fs.readFileSync('src/contentService.ts', 'utf8');
const start = service.indexOf('const normalizeCatalogItemsCooperatively =');
const end = service.indexOf('\nconst normalizedLocalPayload', start);
const source = stripTypeScriptTypes(service.slice(start, end));

test('real cooperative normalizer produces the same complete payload as the synchronous path', async () => {
  const bootstrap = JSON.parse(fs.readFileSync('src/catalogBootstrap.json', 'utf8'));
  const exports = {};
  const config = new Proxy({ CONTENT_REPOSITORY_BASES: ['https://example.com/'] }, {
    get: (target, key) => target[key] ?? '',
  });
  const compiled = ts.transpileModule(service + '\nexports.testing = {parsePayload, parsePayloadCooperatively, mergeLiveCatalogDelta};', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, setTimeout, clearTimeout, URL, Date, console,
    require: (name) => {
      if (name === './catalogBootstrap.json') return bootstrap;
      if (name === './config') return config;
      if (name === './data') return { CATALOG: [], VERIFIED_IRANIAN_SCHEDULE: [] };
      if (name === 'expo-file-system/legacy') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  let heartbeats = 0;
  const timer = setInterval(() => heartbeats++, 1);
  let actual;
  try { actual = await exports.testing.parsePayloadCooperatively(bootstrap); }
  finally { clearInterval(timer); }
  const expected = exports.testing.parsePayload(bootstrap);
  assert.ok(heartbeats > 100, 'event loop did not run while normalizing');
  assert.equal(actual.items.length, bootstrap.items.length);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  const delta = {clientRevision:'next',updatedAt:expected.updatedAt,baseUpdatedAt:expected.updatedAt,
    itemCount:expected.items.length,itemOrder:expected.items.map(i=>`${i.type}:${i.id}`),upserts:[]};
  assert.equal(exports.testing.mergeLiveCatalogDelta(expected,delta).items.length,expected.items.length);
  assert.equal(exports.testing.mergeLiveCatalogDelta({...expected,updatedAt:'1970-01-01'},delta),null);
});

test('normalization yields before completing a complete catalog and preserves every valid row in order', async () => {
  const values = JSON.parse(fs.readFileSync('src/catalogBootstrap.json', 'utf8')).items;
  let processed = 0;
  let yields = 0;
  let previous = 0;
  const run = vm.runInNewContext(source + '\nnormalizeCatalogItemsCooperatively;', {
    Date,
    normalizeCatalogItem: (item) => { processed++; return item; },
    setTimeout: (callback) => {
      assert.ok(processed - previous <= 16, 'unbounded synchronous batch');
      assert.ok(processed < values.length, 'yield happened only after all work');
      previous = processed;
      yields++;
      return setTimeout(callback, 0);
    },
  });
  const result = await run(values);
  assert.ok(yields > 100);
  assert.equal(result.length, values.length);
  for (let i = 0; i < values.length; i++) assert.equal(result[i], values[i]);
});

test('remote bootstrap, live delta and restored cache use cooperative processing', () => {
  assert.ok(service.includes('await parsePayloadCooperatively(rawBootstrap)'));
  assert.ok(service.includes('await parsePayloadCooperatively(JSON.parse(await FileSystem.readAsStringAsync(BOOTSTRAP_CACHE_URI)))'));
  assert.equal(service.match(/await mergeLiveCatalogDeltaCooperatively\(base, live\)/g)?.length, 2);
  const app = fs.readFileSync('App.tsx', 'utf8');
  assert.ok(!app.includes('setTimeout(reloadContentWhenIdle, 12_000)'));
  assert.ok(app.includes('if (!hadVisibleCatalog) setContent(visibleContent)'));
});
