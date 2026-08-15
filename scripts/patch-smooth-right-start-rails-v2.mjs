import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// v1 contains the complete source transformation. Its generated TSX key must
// remain literal `${selected.id}` text; otherwise the patcher's own template
// literal tries to evaluate `selected` while the patch script is running.
const v1Path = 'scripts/patch-smooth-right-start-rails-v1.mjs';
const raw = await fs.readFile(v1Path, 'utf8');
const fixed = raw.replace('${selected.id}', '\\${selected.id}');
if (fixed === raw) throw new Error('Expected star-works interpolation target was not found in v1 patcher.');

const tempPath = path.resolve('.github', '.tmp-smooth-right-start-rails-v2.mjs');
await fs.writeFile(tempPath, fixed, 'utf8');
try {
  await import(`${pathToFileURL(tempPath).href}?run=${Date.now()}`);
} finally {
  await fs.rm(tempPath, { force: true });
}

// v1 originally located the episode positioning declarations with a generic
// `visibleGroups` marker that also exists in another component. The ScrollView
// replacement itself is correctly scoped by its player-specific style, so that
// mismatch can leave episodeRailRef/positionEpisodeRail referenced in
// PlayerEpisodesOverlay but declared elsewhere. Normalize the declaration to
// the component that owns the episode rail after the full v1 transform.
const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');
const episodeDeclaration = `  const episodeRailRef = useRef<ScrollView>(null);\n  const episodeRailPositionedRef = useRef('');\n  const episodeRailKey = \`${'${item.id}:${visibleSeason}:'}${'${visibleGroups.map((group) => group.id).join("|")}'}\`;\n  const positionEpisodeRail = useCallback(() => {\n    if (!visibleGroups.length || episodeRailPositionedRef.current === episodeRailKey) return;\n    episodeRailPositionedRef.current = episodeRailKey;\n    requestAnimationFrame(() => episodeRailRef.current?.scrollToEnd({ animated: false }));\n  }, [episodeRailKey, visibleGroups.length]);\n`;

// Remove any declaration emitted into the wrong component by the old generic
// marker. It is reinserted exactly once inside PlayerEpisodesOverlay below.
source = source.split(episodeDeclaration).join('');

const playerEpisodesStart = source.indexOf('function PlayerEpisodesOverlay');
const playerEpisodesEnd = source.indexOf('\n\nfunction VideoPlayerModal', playerEpisodesStart);
if (playerEpisodesStart < 0 || playerEpisodesEnd <= playerEpisodesStart) {
  throw new Error('PlayerEpisodesOverlay block not found.');
}

const playerEpisodesBlock = source.slice(playerEpisodesStart, playerEpisodesEnd);
const visibleGroupsMarker = '  const visibleGroups = seasons[visibleSeason] || [];\n';
if (!playerEpisodesBlock.includes(visibleGroupsMarker)) {
  throw new Error('PlayerEpisodesOverlay visibleGroups marker not found.');
}
if (!playerEpisodesBlock.includes('ref={episodeRailRef}') || !playerEpisodesBlock.includes('onContentSizeChange={positionEpisodeRail}')) {
  throw new Error('Player episode ScrollView was not converted to native right-start positioning.');
}

const repairedPlayerEpisodesBlock = playerEpisodesBlock.replace(
  visibleGroupsMarker,
  `${visibleGroupsMarker}${episodeDeclaration}`,
);
source = `${source.slice(0, playerEpisodesStart)}${repairedPlayerEpisodesBlock}${source.slice(playerEpisodesEnd)}`;

const declarationMatches = source.match(/const episodeRailRef = useRef<ScrollView>\(null\);/g) || [];
if (declarationMatches.length !== 1) {
  throw new Error(`Expected exactly one episodeRailRef declaration, found ${declarationMatches.length}.`);
}

await fs.writeFile(appPath, source, 'utf8');
console.log('Horizontal media rails now start at the right with native LTR scroll physics and player episode refs scoped correctly.');
