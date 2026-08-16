import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const service = await fs.readFile('src/contentService.ts', 'utf8');

const requiredApp = [
  'const STARTUP_MIN_VISIBLE_MS = 5000;',
  'const startupStartedAtRef = useRef(Date.now());',
  'const remaining = STARTUP_MIN_VISIBLE_MS - (Date.now() - startupStartedAtRef.current);',
  'startupFallbackTimer = setTimeout(dismissStartup, 10000);',
  'const freshContentPromise = loadContent(false);',
  'const bootstrapContent = await loadBootstrapContent();',
  'const freshContent = await freshContentPromise;',
];
for (const marker of requiredApp) {
  if (!app.includes(marker)) throw new Error(`Missing truthful startup marker: ${marker}`);
}

const fullStart = app.indexOf('const freshContentPromise = loadContent(false);');
const bootstrapStart = app.indexOf('const bootstrapContent = await loadBootstrapContent();', fullStart);
if (fullStart < 0 || bootstrapStart < 0 || fullStart > bootstrapStart) {
  throw new Error('Complete catalog must start before awaiting bootstrap.');
}

if (!service.includes('if (manifest.clientRevision) {\n    return Boolean(cacheMetadata.manifestRevision === manifest.clientRevision);')) {
  throw new Error('clientRevision must be authoritative for cache validity.');
}
if (/manifest\.catalogVersion[\s\S]{0,220}cached\.version[\s\S]{0,220}manifest\.clientRevision/.test(service)) {
  throw new Error('Coarse catalog fields must not override a clientRevision mismatch.');
}
if (!service.includes('const manifestCandidates = [...remoteRepositoryUrlCandidates(manifestUrl)].sort')) {
  throw new Error('Manifest candidates must explicitly prioritize source truth.');
}
if (!service.includes('raw\\.githubusercontent\\.com')) {
  throw new Error('Raw GitHub manifest preference is missing.');
}
if (!service.includes('setTimeout(() => controller.abort(), 1800)')) {
  throw new Error('Blocked Raw manifest failover must stay bounded.');
}

console.log(JSON.stringify({
  startupWarmupMs: 5000,
  emergencyEscapeMs: 10000,
  completeCatalogStartsBeforeBootstrapWait: true,
  clientRevisionAuthoritative: true,
  rawManifestPreferredWithBoundedFailover: true,
}, null, 2));
