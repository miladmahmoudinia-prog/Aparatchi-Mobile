import fs from 'node:fs/promises';

const appFile = 'App.tsx';
let app = await fs.readFile(appFile, 'utf8');

const bootstrapNeedle = `        let bootstrapApplied = false;
        try {
          const bootstrapContent = await bootstrapContentPromise;
          bootstrapApplied = Boolean(bootstrapContent && applyContent(bootstrapContent));
        } catch {`;
const bootstrapReplacement = `        let bootstrapApplied = false;
        try {
          const bootstrapContent = await bootstrapContentPromise;
          let startupContent = bootstrapContent;
          if (bootstrapContent?.items.length && firstContent.source === 'cache' && firstContent.items.length) {
            // The fresh Home snapshot owns the front of the catalog, while the
            // last complete index keeps categories/search usable until the new
            // full index finishes in background. Never let an old cache outrank
            // a title carried by the current revision-bound bootstrap.
            const bootstrapIds = new Set(
              bootstrapContent.items.map((item) => \`${'${item.type}:${String(item.id)}'}\`),
            );
            startupContent = {
              ...bootstrapContent,
              items: [
                ...bootstrapContent.items,
                ...firstContent.items.filter((item) =>
                  !bootstrapIds.has(\`${'${item.type}:${String(item.id)}'}\`),
                ),
              ],
            };
          }
          bootstrapApplied = Boolean(startupContent && applyContent(startupContent));
        } catch {`;
if (!app.includes(bootstrapNeedle)) throw new Error('cold-start bootstrap marker not found');
app = app.replace(bootstrapNeedle, bootstrapReplacement);

const hydrationNeedle = `        if (current.detailPath !== activeSummary.detailPath) return current;
        return fullItem;`;
const hydrationReplacement = `        if (current.detailPath !== activeSummary.detailPath) return current;

        // Keep the artwork that was already visible when Detail opened. The
        // immutable shard may contain a newer/fallback backdrop, but swapping it
        // one or two seconds after the screen is mounted looks like a broken
        // banner. The next fresh catalog open can still adopt new artwork.
        const visiblePoster = current.poster || current.posterFallback || '';
        const visibleBackdrop = current.backdrop || current.backdropFallback || visiblePoster;
        return {
          ...fullItem,
          ...(visiblePoster ? {
            poster: current.poster || visiblePoster,
            posterFallback: current.posterFallback || fullItem.posterFallback,
          } : {}),
          ...(visibleBackdrop ? {
            backdrop: current.backdrop || visibleBackdrop,
            backdropFallback: current.backdropFallback || fullItem.backdropFallback,
          } : {}),
        };`;
if (!app.includes(hydrationNeedle)) throw new Error('detail hydration marker not found');
app = app.replace(hydrationNeedle, hydrationReplacement);
await fs.writeFile(appFile, app, 'utf8');

const serviceFile = 'src/contentService.ts';
let service = await fs.readFile(serviceFile, 'utf8');
const serviceNeedle = `      const parsed = parsePayload(JSON.parse(await response.text()));
      if (!parsed?.items.length) continue;`;
const serviceReplacement = `      const rawBootstrap = JSON.parse(await response.text());
      const bootstrapRecord = rawBootstrap && typeof rawBootstrap === 'object'
        ? rawBootstrap as Record<string, unknown>
        : {};
      const payloadClientRevision = asString(
        bootstrapRecord.clientRevision ?? bootstrapRecord.client_revision,
      );
      // updatedAt/version are catalog-level metadata and can stay identical while
      // generated client artifacts change. A current app must only reveal the
      // bootstrap produced for the exact client index announced by the manifest.
      if (manifest?.clientRevision && payloadClientRevision !== manifest.clientRevision) continue;
      const parsed = parsePayload(rawBootstrap);
      if (!parsed?.items.length) continue;`;
if (!service.includes(serviceNeedle)) throw new Error('bootstrap revision validation marker not found');
service = service.replace(serviceNeedle, serviceReplacement);
await fs.writeFile(serviceFile, service, 'utf8');

const testFile = 'scripts/tests/device-startup-detail-stability-v32.test.mjs';
const testSource = `import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('cold start overlays the fresh Home snapshot on the complete cached navigation catalog', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  assert.match(source, /const bootstrapIds = new Set/);
  assert.match(source, /\.\.\.bootstrapContent\.items,[\\s\\S]*\.\.\.firstContent\.items\.filter/);
  assert.match(source, /bootstrapApplied = Boolean\(startupContent && applyContent\(startupContent\)\)/);
});

test('detail hydration cannot replace already visible poster or backdrop artwork', async () => {
  const source = await fs.readFile('App.tsx', 'utf8');
  assert.match(source, /const visiblePoster = current\.poster \|\| current\.posterFallback/);
  assert.match(source, /const visibleBackdrop = current\.backdrop \|\| current\.backdropFallback \|\| visiblePoster/);
  assert.match(source, /backdrop: current\.backdrop \|\| visibleBackdrop/);
});

test('startup bootstrap is accepted only when it belongs to the manifest client revision', async () => {
  const source = await fs.readFile('src/contentService.ts', 'utf8');
  assert.match(source, /bootstrapRecord\.clientRevision/);
  assert.match(source, /payloadClientRevision !== manifest\.clientRevision/);
  const revisionGuard = source.indexOf('payloadClientRevision !== manifest.clientRevision');
  const parsePayload = source.indexOf('const parsed = parsePayload(rawBootstrap)', revisionGuard);
  assert.ok(revisionGuard >= 0 && parsePayload > revisionGuard, 'revision guard must run before bootstrap parsing/application');
});
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile(testFile, testSource, 'utf8');

console.log('Patched cold-start freshness, cache navigation preservation and detail artwork stability.');
