import fs from 'node:fs/promises';

const appFile = 'App.tsx';
let app = await fs.readFile(appFile, 'utf8');

if (!app.includes('const STARTUP_MIN_VISIBLE_MS = 5000;')) {
  throw new Error('startup minimum marker not found');
}
app = app.replace(
  'const STARTUP_MIN_VISIBLE_MS = 5000;',
  'const STARTUP_MIN_VISIBLE_MS = 0;',
);
app = app.replace(
  'This keeps the existing five-second startup cover useful.',
  'This lets the current Home snapshot dismiss startup as soon as it is usable.',
);
await fs.writeFile(appFile, app, 'utf8');

const serviceFile = 'src/contentService.ts';
let service = await fs.readFile(serviceFile, 'utf8');

const bootstrapStart = service.indexOf('export async function loadBootstrapContent(): Promise<LoadedContent | null> {');
const bootstrapEnd = service.indexOf('\nconst readCachedContent =', bootstrapStart);
if (bootstrapStart < 0 || bootstrapEnd < 0) throw new Error('bootstrap function boundary not found');

const bootstrapFunction = `export async function loadBootstrapContent(): Promise<LoadedContent | null> {
  const remoteUrl = REMOTE_CONTENT_BOOTSTRAP_URL.trim();
  if (!remoteUrl) return null;

  // Manifest mirrors are raced internally. This keeps the exact clientRevision
  // truth check without paying Raw + CDN timeout costs one after another.
  let manifest: RemoteCatalogManifest | null = null;
  try {
    manifest = await fetchRemoteManifest();
  } catch {
    // A current bootstrap is still preferable to the bundled emergency catalog
    // if both manifest mirrors are temporarily unavailable.
  }

  const candidates = remoteRepositoryUrlCandidates(remoteUrl);
  if (!candidates.length) return null;
  const revisionToken = manifest?.bootstrapRevision || manifest?.clientRevision || manifest?.revision || String(Date.now());
  const controllers = candidates.map(() => new AbortController());

  return await new Promise<LoadedContent | null>((resolve) => {
    let pending = candidates.length;
    let settled = false;

    candidates.forEach((candidate, index) => {
      const controller = controllers[index];
      const timeout = setTimeout(() => controller.abort(), 3200);
      const separator = candidate.includes('?') ? '&' : '?';

      void (async () => {
        try {
          const response = await fetch(
            candidate + separator + '_aparatchi_bootstrap=' + encodeURIComponent(revisionToken) + '&t=' + Date.now(),
            {
              headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
              signal: controller.signal,
            },
          );
          if (!response.ok) return;

          const rawBootstrap = JSON.parse(await response.text());
          const bootstrapRecord = rawBootstrap && typeof rawBootstrap === 'object'
            ? rawBootstrap as Record<string, unknown>
            : {};
          const payloadClientRevision = asString(
            bootstrapRecord.clientRevision ?? bootstrapRecord.client_revision,
          );
          if (manifest?.clientRevision && payloadClientRevision !== manifest.clientRevision) return;

          const parsed = parsePayload(rawBootstrap);
          if (!parsed?.items.length) return;
          if (
            manifest?.catalogUpdatedAt &&
            asString(parsed.updatedAt) !== asString(manifest.catalogUpdatedAt)
          ) return;
          if (settled) return;

          settled = true;
          controllers.forEach((other, otherIndex) => {
            if (otherIndex !== index) other.abort();
          });
          resolve({ ...parsed, source: 'remote' });
        } catch {
          // Another public mirror may still return the current revision.
        } finally {
          clearTimeout(timeout);
          pending -= 1;
          if (!pending && !settled) resolve(null);
        }
      })();
    });
  });
}`;

service = service.slice(0, bootstrapStart) + bootstrapFunction + '\n' + service.slice(bootstrapEnd);

const manifestStart = service.indexOf('const fetchRemoteManifest = async (): Promise<RemoteCatalogManifest | null> => {');
const manifestEnd = service.indexOf('\nconst manifestMatchesCachedContent =', manifestStart);
if (manifestStart < 0 || manifestEnd < 0) throw new Error('manifest function boundary not found');

const manifestFunction = `const fetchRemoteManifest = async (): Promise<RemoteCatalogManifest | null> => {
  const manifestUrl = REMOTE_CONTENT_MANIFEST_URL.trim();
  if (!manifestUrl) return null;

  const manifestCandidates = remoteRepositoryUrlCandidates(manifestUrl);
  if (!manifestCandidates.length) return null;
  const rawCandidates = manifestCandidates.filter((candidate) => /raw\\.githubusercontent\\.com/i.test(candidate));
  const mirrorCandidates = manifestCandidates.filter((candidate) => !/raw\\.githubusercontent\\.com/i.test(candidate));

  const fetchManifestCandidate = async (candidate: string): Promise<RemoteCatalogManifest | null> => {
    const separator = candidate.includes('?') ? '&' : '?';
    const requestUrl = \\`${'${candidate}${separator}'}_aparatchi_manifest=${'${Date.now()}'}\`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2400);
    try {
      const response = await fetch(requestUrl, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const value = await response.json();
      if (!value || typeof value !== 'object') return null;
      const record = value as Record<string, unknown>;
      const revision = asString(record.revision);
      if (!revision) return null;
      return {
        revision,
        ...(asString(record.clientRevision ?? record.client_revision)
          ? { clientRevision: asString(record.clientRevision ?? record.client_revision) }
          : {}),
        ...(asString(record.catalogVersion ?? record.version)
          ? { catalogVersion: asString(record.catalogVersion ?? record.version) }
          : {}),
        ...(asString(record.catalogUpdatedAt ?? record.updatedAt)
          ? { catalogUpdatedAt: asString(record.catalogUpdatedAt ?? record.updatedAt) }
          : {}),
        ...(asNumber(record.sizeBytes, 0) > 0 ? { sizeBytes: asNumber(record.sizeBytes, 0) } : {}),
        ...(asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) > 0
          ? { clientSizeBytes: asNumber(record.clientSizeBytes ?? record.client_size_bytes, 0) }
          : {}),
        ...(asString(record.bootstrapRevision ?? record.bootstrap_revision)
          ? { bootstrapRevision: asString(record.bootstrapRevision ?? record.bootstrap_revision) }
          : {}),
        ...(asNumber(record.bootstrapSizeBytes ?? record.bootstrap_size_bytes, 0) > 0
          ? { bootstrapSizeBytes: asNumber(record.bootstrapSizeBytes ?? record.bootstrap_size_bytes, 0) }
          : {}),
        ...(asString(record.clientIndex ?? record.client_index)
          ? { clientIndex: asString(record.clientIndex ?? record.client_index) }
          : {}),
        ...(asString(record.detailBase ?? record.detail_base)
          ? { detailBase: asString(record.detailBase ?? record.detail_base) }
          : {}),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const firstValidManifest = (candidates: string[]) => {
    if (!candidates.length) return Promise.resolve<RemoteCatalogManifest | null>(null);
    return new Promise<RemoteCatalogManifest | null>((resolve) => {
      let pending = candidates.length;
      let settled = false;
      candidates.forEach((candidate) => {
        void fetchManifestCandidate(candidate).then((value) => {
          if (settled) return;
          if (value) {
            settled = true;
            resolve(value);
            return;
          }
          pending -= 1;
          if (!pending) {
            settled = true;
            resolve(null);
          }
        });
      });
    });
  };

  // Start source truth and CDN at the same instant. Give Raw only a short
  // preference window; a blocked Raw host must never add seconds to cold start.
  const rawPromise = firstValidManifest(rawCandidates);
  const mirrorPromise = firstValidManifest(mirrorCandidates);
  const rawPreferred = await Promise.race([
    rawPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
  ]);
  if (rawPreferred) return rawPreferred;

  const firstAfterPreference = await Promise.race([
    rawPromise.then((value) => ({ source: 'raw' as const, value })),
    mirrorPromise.then((value) => ({ source: 'mirror' as const, value })),
  ]);
  if (firstAfterPreference.value) return firstAfterPreference.value;

  const second = firstAfterPreference.source === 'raw'
    ? await mirrorPromise
    : await rawPromise;
  if (second) return second;
  throw new Error('Catalog manifest is unavailable from all mirrors');
};`;

service = service.slice(0, manifestStart) + manifestFunction + '\n' + service.slice(manifestEnd);
await fs.writeFile(serviceFile, service, 'utf8');

const truthfulStartupTest = `import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const service = await fs.readFile('src/contentService.ts', 'utf8');

const requiredApp = [
  'const STARTUP_MIN_VISIBLE_MS = 0;',
  'const startupStartedAtRef = useRef(Date.now());',
  'startupFallbackTimer = setTimeout(dismissStartup, 10000);',
  'const freshContentPromise = loadContent(false);',
  'const bootstrapContentPromise = loadBootstrapContent()',
  'const bootstrapIds = new Set(',
  'bootstrapApplied = Boolean(startupContent && applyContent(startupContent));',
];
for (const marker of requiredApp) {
  if (!app.includes(marker)) throw new Error(\`Missing truthful startup marker: ${'${marker}'}\`);
}
if (app.includes('const STARTUP_MIN_VISIBLE_MS = 5000;')) {
  throw new Error('Five-second mandatory splash is still active.');
}

const freshStart = app.indexOf('const freshContentPromise = loadContent(false);');
const bootstrapAwait = app.indexOf('const bootstrapContent = await bootstrapContentPromise;', freshStart);
if (freshStart < 0 || bootstrapAwait < 0 || freshStart > bootstrapAwait) {
  throw new Error('Full index must start in background before waiting for the small bootstrap.');
}

const bootstrapStart = service.indexOf('export async function loadBootstrapContent');
const bootstrapEnd = service.indexOf('const readCachedContent', bootstrapStart);
const bootstrap = service.slice(bootstrapStart, bootstrapEnd);
if (!bootstrap.includes('const controllers = candidates.map(() => new AbortController())')) {
  throw new Error('Bootstrap mirrors are not started as a bounded race.');
}
if (bootstrap.includes('for (const candidate of candidates)')) {
  throw new Error('Sequential bootstrap mirror fallback is still present.');
}
if (!bootstrap.includes('payloadClientRevision !== manifest.clientRevision')) {
  throw new Error('Bootstrap is not bound to exact manifest clientRevision.');
}

const manifestStart = service.indexOf('const fetchRemoteManifest = async');
const manifestEnd = service.indexOf('const manifestMatchesCachedContent', manifestStart);
const manifest = service.slice(manifestStart, manifestEnd);
if (!manifest.includes('const rawPromise = firstValidManifest(rawCandidates);')) {
  throw new Error('Raw manifest request is not launched concurrently.');
}
if (!manifest.includes('const mirrorPromise = firstValidManifest(mirrorCandidates);')) {
  throw new Error('CDN manifest request is not launched concurrently.');
}
if (!manifest.includes('setTimeout(() => resolve(null), 900)')) {
  throw new Error('Raw preference window is not bounded.');
}
if (!service.includes('if (manifest.clientRevision) {\\n    return Boolean(cacheMetadata.manifestRevision === manifest.clientRevision);')) {
  throw new Error('clientRevision must remain authoritative for persisted cache validity.');
}

console.log(JSON.stringify({
  mandatorySplashMs: 0,
  emergencyEscapeMs: 10000,
  bootstrapMirrorsConcurrent: true,
  manifestMirrorsConcurrent: true,
  exactClientRevisionGuard: true,
  cachedNavigationKeptBehindFreshHome: true,
}, null, 2));
`;

const visibleMediaTest = `import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const service = await fs.readFile('src/contentService.ts', 'utf8');

const requiredApp = [
  'const STARTUP_MIN_VISIBLE_MS = 0;',
  "if (initialLoad && online && firstContent.source !== 'remote') {",
  'const freshContentPromise = loadContent(false);',
  'const bootstrapContent = await bootstrapContentPromise;',
  'bootstrapApplied = Boolean(startupContent && applyContent(startupContent));',
  'startupFallbackTimer = setTimeout(dismissStartup, 10000);',
  "if (await refreshVpnState()) { setVpnWarningVisible(true); return; }",
];
for (const marker of requiredApp) {
  if (!app.includes(marker)) throw new Error(\`Missing current startup marker: ${'${marker}'}\`);
}

const staleGate = app.indexOf("if (initialLoad && online && firstContent.source !== 'remote') {");
const bootstrapLoad = app.indexOf('const bootstrapContent = await bootstrapContentPromise;', staleGate);
const normalApply = app.indexOf('const firstApplied = applyContent(firstContent);', staleGate);
if (staleGate < 0 || bootstrapLoad < 0 || normalApply < 0 || !(staleGate < bootstrapLoad && bootstrapLoad < normalApply)) {
  throw new Error('Stale cache/local catalog can still be committed before current bootstrap on online cold start.');
}

if (app.includes("!vpnActive && (hasPlayableStream || primaryOperatorPlayFile)")) {
  throw new Error('Playable action is still hidden merely because VPN is active.');
}
const streamHandler = app.slice(app.indexOf('const openStreamInsideApp = async ('), app.indexOf('const playRecommendedMovieInsidePlayer', app.indexOf('const openStreamInsideApp = async (')));
if (!streamHandler.includes('if (await refreshVpnState()) { setVpnWarningVisible(true); return; }')) {
  throw new Error('VPN safety check disappeared from actual playback action.');
}

const bootstrapStart = service.indexOf('export async function loadBootstrapContent');
const bootstrapEnd = service.indexOf('const readCachedContent', bootstrapStart);
const bootstrap = service.slice(bootstrapStart, bootstrapEnd);
if (!bootstrap.includes('candidates.forEach((candidate, index) => {')) {
  throw new Error('Bootstrap mirrors are not raced concurrently.');
}
if (!bootstrap.includes('setTimeout(() => controller.abort(), 3200)')) {
  throw new Error('Bootstrap request timeout is not bounded.');
}
if (!bootstrap.includes('payloadClientRevision !== manifest.clientRevision')) {
  throw new Error('Bootstrap can reveal a different client revision than manifest.');
}
if (!service.includes('const catalogCandidates = [...remoteRepositoryUrlCandidates(remoteUrl)].sort')) {
  throw new Error('Full catalog source-truth preference disappeared.');
}

console.log(JSON.stringify({
  staleCacheVisibleBeforeCurrentBootstrap: false,
  mandatoryStartupMinimumMs: 0,
  emergencyStartupFallbackMs: 10000,
  bootstrapMirrorRace: true,
  fullCatalogBackgroundRefresh: true,
  playActionVisibleWithVpn: true,
  vpnStillCheckedOnTap: true,
}, null, 2));
`;

await fs.writeFile('scripts/test-truthful-startup-cache-v6.mjs', truthfulStartupTest, 'utf8');
await fs.writeFile('scripts/test-visible-media-startup-v7.mjs', visibleMediaTest, 'utf8');

const v33Test = `import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('first install does not impose a five-second startup minimum', async () => {
  const app = await fs.readFile('App.tsx', 'utf8');
  assert.match(app, /const STARTUP_MIN_VISIBLE_MS = 0;/);
  assert.doesNotMatch(app, /const STARTUP_MIN_VISIBLE_MS = 5000;/);
});

test('first install races bootstrap mirrors instead of stacking their timeouts', async () => {
  const service = await fs.readFile('src/contentService.ts', 'utf8');
  const start = service.indexOf('export async function loadBootstrapContent');
  const end = service.indexOf('const readCachedContent', start);
  const bootstrap = service.slice(start, end);
  assert.match(bootstrap, /const controllers = candidates\.map/);
  assert.match(bootstrap, /candidates\.forEach\(\(candidate, index\) =>/);
  assert.doesNotMatch(bootstrap, /for \(const candidate of candidates\)/);
  assert.match(bootstrap, /payloadClientRevision !== manifest\.clientRevision/);
});

test('manifest source truth and mirror begin together with only a short Raw preference', async () => {
  const service = await fs.readFile('src/contentService.ts', 'utf8');
  assert.match(service, /const rawPromise = firstValidManifest\(rawCandidates\);/);
  assert.match(service, /const mirrorPromise = firstValidManifest\(mirrorCandidates\);/);
  assert.match(service, /setTimeout\(\(\) => resolve\(null\), 900\)/);
});
`;
await fs.writeFile('scripts/tests/first-install-freshness-v33.test.mjs', v33Test, 'utf8');

console.log('Patched first-install startup to use revision-bound concurrent mirrors with no mandatory splash delay.');
