import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const app = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
const parts = [['const catalogItemTimestamp','const hasCategory'],['const EPISODE_UPDATE_LABEL_PATTERN','const filterTitle'],['const sortForCatalogFilter','const catalogFilterCache'],['const summaryMatchesHomeFilter','const HomeCatalogSection']];
const source = parts.map(([a,b]) => app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)))).join('\n');
const rows = vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nbuildHomeCatalogRows', {HOME_CATALOG_ROWS:[{filter:'latest'},{filter:'updated'}]});
test('new movie beyond first ten and newly published series without episode label lead their own shelves', () => {
  const old = {type:'movie', firstSeenAt:'2025-01-01'};
  const latest = {...old, firstSeenAt:'2026-11-18'};
  const released = {type:'series',firstSeenAt:'2026-11-17',publishedAt:'2026-11-17'};
  const metadata = {type:'series',firstSeenAt:'2025-02-01',updatedAt:'2026-11-18'};
  const [movies,series] = rows([...Array(12).fill(old),metadata,latest,released]);
  assert.equal(movies.items[0],latest); assert.equal(movies.items.length,10); assert.equal(series.items[0],released);
});
