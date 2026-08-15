import fs from 'node:fs/promises';

// Apply the complete v2 rail transformation first.
await import('./patch-smooth-right-start-rails-v2.mjs');

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');
const start = source.indexOf('function PlayerEpisodesOverlay(');
const end = source.indexOf('\nfunction VideoPlayerModal(', start);
if (start < 0 || end < 0) throw new Error('PlayerEpisodesOverlay block not found.');
let block = source.slice(start, end);

if (!block.includes('const episodeRailRef = useRef<ScrollView>(null);')) {
  const anchor = `  const visibleGroups = seasons[visibleSeason] || [];\n`;
  if (!block.includes(anchor)) throw new Error('PlayerEpisodesOverlay visibleGroups anchor not found.');
  const declaration = `${anchor}  const episodeRailRef = useRef<ScrollView>(null);\n  const episodeRailPositionedRef = useRef('');\n  const episodeRailKey = \`${'${item.id}:${visibleSeason}:${visibleGroups.map((group) => group.id).join("|")}'}\`;\n  const positionEpisodeRail = useCallback(() => {\n    if (!visibleGroups.length || episodeRailPositionedRef.current === episodeRailKey) return;\n    episodeRailPositionedRef.current = episodeRailKey;\n    requestAnimationFrame(() => episodeRailRef.current?.scrollToEnd({ animated: false }));\n  }, [episodeRailKey, visibleGroups.length]);\n`;
  block = block.replace(anchor, declaration);
  source = `${source.slice(0, start)}${block}${source.slice(end)}`;
}

await fs.writeFile(appPath, source, 'utf8');
console.log('Player episode rail refs are scoped inside PlayerEpisodesOverlay.');
