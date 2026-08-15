import fs from 'node:fs/promises';

const appFile = 'App.tsx';
let app = await fs.readFile(appFile, 'utf8');

if (!app.includes('const STARTUP_MIN_VISIBLE_MS = 5000;')) {
  const marker = '\nfunction AppContent() {';
  if (!app.includes(marker)) throw new Error('AppContent marker not found');
  app = app.replace(marker, '\nconst STARTUP_MIN_VISIBLE_MS = 5000;\n' + marker);
}

if (!app.includes('const startupStartedAtRef = useRef(Date.now());')) {
  const marker = '  const lastContentLoadRef = useRef(0);\n  const startupDismissedRef = useRef(false);';
  if (!app.includes(marker)) throw new Error('startup refs marker not found');
  app = app.replace(marker,
    '  const lastContentLoadRef = useRef(0);\n  const startupStartedAtRef = useRef(Date.now());\n  const startupDismissedRef = useRef(false);');
}

const oldDismiss = `  const dismissStartup = useCallback(() => {
    if (startupDismissedRef.current) return;
    startupDismissedRef.current = true;
    setStartupVisible(false);
  }, []);`;
const newDismiss = `  const dismissStartup = useCallback(() => {
    if (startupDismissedRef.current) return;
    const remaining = STARTUP_MIN_VISIBLE_MS - (Date.now() - startupStartedAtRef.current);
    if (remaining > 0) {
      if (!startupDismissTimerRef.current) {
        startupDismissTimerRef.current = setTimeout(() => {
          startupDismissTimerRef.current = null;
          if (startupDismissedRef.current) return;
          startupDismissedRef.current = true;
          setStartupVisible(false);
        }, remaining);
      }
      return;
    }
    if (startupDismissTimerRef.current) {
      clearTimeout(startupDismissTimerRef.current);
      startupDismissTimerRef.current = null;
    }
    startupDismissedRef.current = true;
    setStartupVisible(false);
  }, []);`;
if (app.includes(oldDismiss)) app = app.replace(oldDismiss, newDismiss);
else if (!app.includes('const remaining = STARTUP_MIN_VISIBLE_MS')) throw new Error('dismissStartup block not found');

app = app.replace(
  `          void (async () => {
            const bootstrapContent = await loadBootstrapContent();
            if (bootstrapContent) applyContent(bootstrapContent);
            const freshContent = await loadContent(false);
            if (freshContent.source !== 'local') applyContent(freshContent);
          })().catch(() => undefined);`,
  `          void (async () => {
            // Start the complete catalog at the same instant as the lightweight
            // bootstrap. The bootstrap may paint Home first, but it must never
            // postpone the full catalog/category refresh.
            const freshContentPromise = loadContent(false);
            const bootstrapContent = await loadBootstrapContent();
            if (bootstrapContent) applyContent(bootstrapContent);
            const freshContent = await freshContentPromise;
            if (freshContent.source !== 'local') applyContent(freshContent);
          })().catch(() => undefined);`,
);

app = app.replace('startupFallbackTimer = setTimeout(dismissStartup, 2000);', 'startupFallbackTimer = setTimeout(dismissStartup, 5000);');
await fs.writeFile(appFile, app, 'utf8');

const serviceFile = 'src/contentService.ts';
let service = await fs.readFile(serviceFile, 'utf8');

const oldLoop = `  for (const candidate of remoteRepositoryUrlCandidates(manifestUrl)) {`;
const newLoop = `  const manifestCandidates = [...remoteRepositoryUrlCandidates(manifestUrl)].sort((a, b) =>
    Number(/raw\\.githubusercontent\\.com/i.test(b)) - Number(/raw\\.githubusercontent\\.com/i.test(a))
  );
  for (const candidate of manifestCandidates) {`;
if (service.includes(oldLoop)) service = service.replace(oldLoop, newLoop);
else if (!service.includes('const manifestCandidates = [...remoteRepositoryUrlCandidates(manifestUrl)]')) throw new Error('manifest loop marker not found');

// Manifest is tiny; fail over from a blocked Raw endpoint quickly instead of
// letting a stale CDN manifest win forever or delaying startup for eight seconds.
const manifestStart = service.indexOf('const fetchRemoteManifest = async');
const manifestEnd = service.indexOf('const manifestMatchesCachedContent', manifestStart);
if (manifestStart < 0 || manifestEnd < 0) throw new Error('manifest function boundaries not found');
const manifestBlock = service.slice(manifestStart, manifestEnd).replace('setTimeout(() => controller.abort(), 8_000)', 'setTimeout(() => controller.abort(), 1800)');
service = service.slice(0, manifestStart) + manifestBlock + service.slice(manifestEnd);

const oldMatch = `const manifestMatchesCachedContent = (
  manifest: RemoteCatalogManifest,
  cached: CatalogPayload,
) => {
  const revision = manifest.clientRevision || manifest.revision;
  return Boolean(
    (cacheMetadata.manifestRevision && cacheMetadata.manifestRevision === revision) ||
    (
      manifest.catalogVersion &&
      manifest.catalogUpdatedAt &&
      cached.version === manifest.catalogVersion &&
      cached.updatedAt === manifest.catalogUpdatedAt
    )
  );
};`;
const newMatch = `const manifestMatchesCachedContent = (
  manifest: RemoteCatalogManifest,
  cached: CatalogPayload,
) => {
  const revision = manifest.clientRevision || manifest.revision;
  // A clientRevision identifies the generated mobile artifact itself. Version
  // and catalogUpdatedAt describe the source catalog and can remain unchanged
  // while media/category/client-index fixes are published. Never let those
  // coarse fields bless an older cached client artifact.
  if (manifest.clientRevision) {
    return Boolean(cacheMetadata.manifestRevision === manifest.clientRevision);
  }
  if (cacheMetadata.manifestRevision) {
    return cacheMetadata.manifestRevision === revision;
  }
  return Boolean(
    manifest.catalogVersion &&
    manifest.catalogUpdatedAt &&
    cached.version === manifest.catalogVersion &&
    cached.updatedAt === manifest.catalogUpdatedAt
  );
};`;
if (service.includes(oldMatch)) service = service.replace(oldMatch, newMatch);
else if (!service.includes('A clientRevision identifies the generated mobile artifact itself.')) throw new Error('manifest cache match block not found');

await fs.writeFile(serviceFile, service, 'utf8');

const startupTestFile = 'scripts/test-startup-projectionist.mjs';
let startupTest = await fs.readFile(startupTestFile, 'utf8');
startupTest = startupTest
  .replace("'startupFallbackTimer = setTimeout(dismissStartup, 2000);'", "'startupFallbackTimer = setTimeout(dismissStartup, 5000);'")
  .replace("if (app.includes('minimumVisibleMs')) throw new Error('A forced minimum startup duration must not be present.');", "if (!app.includes('const STARTUP_MIN_VISIBLE_MS = 5000;')) throw new Error('Startup must keep the requested five-second warm-up.');")
  .replace("if (app.includes('startupStartedAtRef')) throw new Error('The obsolete startup minimum-duration clock is still present.');", "if (!app.includes('const startupStartedAtRef = useRef(Date.now());')) throw new Error('Startup warm-up clock is missing.');")
  .replace("if (dismissBlock.includes('setTimeout(')) throw new Error('Ready Home content must not be delayed by a startup timer.');", "if (!dismissBlock.includes('setTimeout(')) throw new Error('Ready content must respect the five-second warm-up.');")
  .replace("if (!dismissBlock.includes('setStartupVisible(false);')) throw new Error('Ready Home content must dismiss startup immediately.');", "if (!dismissBlock.includes('STARTUP_MIN_VISIBLE_MS')) throw new Error('Startup dismissal is not tied to the warm-up duration.');")
  .replace('minimumVisibleMs: 0,', 'minimumVisibleMs: 5000,')
  .replace('emergencyFallbackMs: 2000,', 'emergencyFallbackMs: 5000,')
  .replace('dismissesImmediatelyWhenContentReady: true,', 'dismissesImmediatelyWhenContentReady: false,');
await fs.writeFile(startupTestFile, startupTest, 'utf8');

console.log('Truthful startup/cache patch applied.');
