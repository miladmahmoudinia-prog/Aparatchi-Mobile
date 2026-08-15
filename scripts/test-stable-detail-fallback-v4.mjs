import fs from 'node:fs/promises';

const service = await fs.readFile('src/contentService.ts', 'utf8');
const app = await fs.readFile('App.tsx', 'utf8');

const requireMarker = (source, marker, label) => {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
};

requireMarker(service, "detailPath.match(/(?:^|\\/)([a-f0-9]{12})-[a-f0-9]{12}\\.json$/i)", 'identity extraction from stale hashed detail');
requireMarker(service, '`catalog-stable/${identityMatch[1].toLowerCase()}.json`', 'stable pointer path');
requireMarker(service, 'const pointerRaw = await fetchFirstRawPath(stablePath);', 'stable pointer fetch');
requireMarker(service, 'pointerType === asString(summary.type)', 'stable pointer type verification');
requireMarker(service, 'pointerId === asString(summary.id)', 'stable pointer id verification');
requireMarker(service, '/^catalog-items\\/[a-f0-9]{12}-[a-f0-9]{12}\\.json$/i.test(currentDetailPath)', 'stable pointer target validation');
requireMarker(service, 'const currentRaw = await fetchFirstRawPath(currentDetailPath);', 'current detail fetch through stable pointer');
requireMarker(service, 'if (!resolvedDetail) return null;', 'network/detail failure remains unresolved');
requireMarker(app, 'const refreshed = await loadContent(false, true);', 'final forced-index fallback');

// Some summaries legitimately have no detailPath and can be considered complete
// lightweight records. What must never happen is converting a FAILED hydration
// attempt into detailLoaded=true. The old app-level fallback did exactly that.
if (app.includes('return fullItem || { ...current, detailLoaded: true };')) {
  throw new Error('App still fabricates a loaded detail after hydration failure.');
}

console.log(JSON.stringify({
  staleIndexRecovery: 'hashed-detail -> stable-pointer -> current-detail',
  pointerIdentityVerified: true,
  unsafePointerTargetsRejected: true,
  failedNetworkHydrationReturnsNull: true,
  falseLoadedHydrationState: false,
}, null, 2));
