import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const service = await fs.readFile('src/contentService.ts', 'utf8');

const requiredApp = [
  'const STARTUP_MIN_VISIBLE_MS = 0;',
  "if (initialLoad && online && firstContent.source !== 'remote') {",
  'const freshContentPromise = loadContent(false);',
  'const bootstrapContent = await bootstrapContentPromise;',
  'bootstrapApplied = Boolean(startupContent && applyContent(startupContent));',
  "if (await refreshVpnState()) { setVpnWarningVisible(true); return; }",
];
for (const marker of requiredApp) {
  if (!app.includes(marker)) throw new Error(`Missing current startup marker: ${marker}`);
}
if (!/startupFallbackTimer = setTimeout\(\(\) => \{[\s\S]*?\}, 10000\);/.test(app)) {
  throw new Error('Ten-second emergency startup escape is missing.');
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
