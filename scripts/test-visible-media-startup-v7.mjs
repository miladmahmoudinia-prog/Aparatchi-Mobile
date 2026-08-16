import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const service = await fs.readFile('src/contentService.ts', 'utf8');

const requiredApp = [
  'const STARTUP_MIN_VISIBLE_MS = 5000;',
  "if (initialLoad && online && firstContent.source !== 'remote') {",
  'const freshContentPromise = loadContent(false);',
  'const bootstrapContent = await loadBootstrapContent();',
  'const currentBootstrapApplied = Boolean(bootstrapContent && applyContent(bootstrapContent));',
  'startupFallbackTimer = setTimeout(dismissStartup, 10000);',
  "if (await refreshVpnState()) { setVpnWarningVisible(true); return; }",
];
for (const marker of requiredApp) {
  if (!app.includes(marker)) throw new Error(`Missing v7 app marker: ${marker}`);
}

const staleGate = app.indexOf("if (initialLoad && online && firstContent.source !== 'remote') {");
const normalApply = app.indexOf('const firstApplied = applyContent(firstContent);', staleGate);
const bootstrapLoad = app.indexOf('const bootstrapContent = await loadBootstrapContent();', staleGate);
if (staleGate < 0 || bootstrapLoad < 0 || normalApply < 0 || !(staleGate < bootstrapLoad && bootstrapLoad < normalApply)) {
  throw new Error('Persisted cache can still be committed before current bootstrap on an online cold start.');
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
if (!bootstrap.includes('const candidates = [...remoteRepositoryUrlCandidates(remoteUrl)].sort')) {
  throw new Error('Bootstrap mirrors are not explicitly ordered.');
}
if (!bootstrap.includes('raw\\.githubusercontent\\.com')) throw new Error('Raw bootstrap preference missing.');
if (!bootstrap.includes('setTimeout(() => controller.abort(), 3200)')) throw new Error('Bootstrap failover is not bounded.');
if (bootstrap.includes('Promise<LoadedContent | null>((resolve)')) throw new Error('Old stale-mirror bootstrap race is still present.');

if (!service.includes('const catalogCandidates = [...remoteRepositoryUrlCandidates(remoteUrl)].sort')) {
  throw new Error('Full catalog mirrors are not Raw-first.');
}

console.log(JSON.stringify({
  staleCacheVisibleBeforeCurrentBootstrap: false,
  normalStartupMinimumMs: 5000,
  emergencyStartupFallbackMs: 10000,
  bootstrapRawFirst: true,
  fullCatalogRawFirst: true,
  playActionVisibleWithVpn: true,
  vpnStillCheckedOnTap: true,
}, null, 2));
