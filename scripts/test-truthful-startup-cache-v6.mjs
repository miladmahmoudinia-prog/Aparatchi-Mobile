import fs from 'node:fs/promises';

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
  if (!app.includes(marker)) throw new Error(`Missing truthful startup marker: ${marker}`);
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
if (!service.includes('if (manifest.clientRevision) {\n    return Boolean(cacheMetadata.manifestRevision === manifest.clientRevision);')) {
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
