import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const app = await fs.readFile('App.tsx', 'utf8');
const service = await fs.readFile('src/contentService.ts', 'utf8');
const config = await fs.readFile('src/config.ts', 'utf8');

const horizontalStart = app.indexOf('const HorizontalCatalog = memo(function HorizontalCatalog');
const horizontalEnd = app.indexOf('const StarPersonButton', horizontalStart);
assert.ok(horizontalStart >= 0 && horizontalEnd > horizontalStart, 'HorizontalCatalog block exists');
const horizontal = app.slice(horizontalStart, horizontalEnd);

assert.match(horizontal, /data=\{items\}/, 'Home rail renders source data directly');
assert.match(horizontal, /\binverted\b/, 'Home rail places item zero on the RTL/right edge without jumping to a last index');
assert.doesNotMatch(horizontal, /displayedItems/, 'Home rail no longer reverses data before virtualization');
assert.doesNotMatch(horizontal, /initialScrollIndex/, 'Home rail no longer asks Android to materialize only a far-end cell first');
assert.match(horizontal, /initialNumToRender=\{4\}/, 'Home rail remains bounded');
assert.match(horizontal, /maxToRenderPerBatch=\{4\}/, 'Home rail batching remains bounded');
assert.match(horizontal, /windowSize=\{4\}/, 'Home rail window remains bounded');
assert.match(horizontal, /removeClippedSubviews=\{false\}/, 'known Android clipping regression stays disabled');

assert.match(app, /const populatedRows = useMemo\(\(\) => rows\.filter\(\(row\) => row\.items\.length > 0\), \[rows\]\);/,
  'eager Home slots are based on populated rows, not fixed empty config positions');
assert.match(app, /populatedRows\.slice\(0, 4\)/, 'first four populated rows are eager');
assert.match(app, /populatedRows\.slice\(4\)/, 'only later populated rows are virtualized');

assert.match(config, /REMOTE_CONTENT_BOOTSTRAP_URL/, 'bootstrap endpoint is configured');
assert.match(config, /catalog-bootstrap\.json/, 'bootstrap endpoint targets generated Content file');
assert.match(service, /export async function loadBootstrapContent\(\)/, 'bootstrap loader is exported');
assert.match(service, /controllers = candidates\.map\(\(\) => new AbortController\(\)\)/, 'bootstrap mirrors race instead of waiting sequentially');
assert.match(service, /12_000/, 'bootstrap mirror wait is bounded');

const firstAppliedMarker = app.indexOf('if (firstApplied)');
assert.ok(firstAppliedMarker >= 0, 'initial content application block exists');
const firstAppliedBlock = app.slice(firstAppliedMarker, firstAppliedMarker + 1800);
const bootstrapIndex = firstAppliedBlock.indexOf('await loadBootstrapContent()');
const fullIndex = firstAppliedBlock.indexOf('await loadContent(false)');
assert.ok(bootstrapIndex >= 0 && fullIndex > bootstrapIndex, 'cold start applies bootstrap before loading the full index');
assert.match(firstAppliedBlock, /freshContent\.source !== 'local'/, 'failed full refresh cannot downgrade a real bootstrap back to the emergency local catalog');

console.log('Home first-frame v4 regression checks passed.');
