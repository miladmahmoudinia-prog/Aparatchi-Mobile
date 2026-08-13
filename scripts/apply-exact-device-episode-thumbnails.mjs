import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const ensureImport = () => {
  if (source.includes("import { VideoView, createVideoPlayer, useVideoPlayer } from 'expo-video';")) return;
  const before = "import { VideoView, useVideoPlayer } from 'expo-video';";
  if (!source.includes(before)) throw new Error('Missing expo-video import');
  source = source.replace(before, "import { VideoView, createVideoPlayer, useVideoPlayer } from 'expo-video';");
};

ensureImport();

const helperMarker = `function SeriesEpisodeShowcase({
  item,
  onPlay,
  onOpenDownloads,
  onOpenOperator,`;

const helper = `const exactEpisodeThumbnailCache = new Map<string, any>();
const exactEpisodeThumbnailFailures = new Set<string>();
let exactEpisodeThumbnailQueue: Promise<void> = Promise.resolve();

function ExactEpisodeArtwork({
  item,
  group,
  artwork,
}: {
  item: CatalogItem;
  group: DownloadSection;
  artwork: string;
}) {
  const exactSource = useMemo(() => {
    const versions = playableVersionsFor(item, group);
    return versions[0]?.defaultSource?.url || '';
  }, [group, item]);
  const cacheKey = exactSource ? \`${'${item.id}:${group.id}:${exactSource}'}\` : '';
  const [generated, setGenerated] = useState<any>(() =>
    cacheKey ? exactEpisodeThumbnailCache.get(cacheKey) || null : null,
  );

  useEffect(() => {
    if (!cacheKey) {
      setGenerated(null);
      return undefined;
    }
    const cached = exactEpisodeThumbnailCache.get(cacheKey);
    setGenerated(cached || null);
    if (artwork || cached || exactEpisodeThumbnailFailures.has(cacheKey) || !isDirectMediaUrl(exactSource)) {
      return undefined;
    }

    let cancelled = false;
    exactEpisodeThumbnailQueue = exactEpisodeThumbnailQueue
      .catch(() => undefined)
      .then(async () => {
        if (cancelled || exactEpisodeThumbnailCache.has(cacheKey) || exactEpisodeThumbnailFailures.has(cacheKey)) return;
        const player = createVideoPlayer(exactSource);
        try {
          const episodeNumber = Math.max(1, Number(group.episodeNumber || 1));
          const requestedTime = 45 + ((episodeNumber * 37) % 150);
          const thumbnails = await player.generateThumbnailsAsync([requestedTime], { maxWidth: 640 });
          const thumbnail = thumbnails[0];
          if (!thumbnail) {
            exactEpisodeThumbnailFailures.add(cacheKey);
            return;
          }
          exactEpisodeThumbnailCache.set(cacheKey, thumbnail);
          if (!cancelled) setGenerated(thumbnail);
        } catch {
          exactEpisodeThumbnailFailures.add(cacheKey);
        } finally {
          player.release();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artwork, cacheKey, exactSource, group.episodeNumber]);

  if (artwork) {
    return <CatalogArtwork primary={artwork} style={styles.episodeShowcaseArtwork} contentFit="cover" imageKind="backdrop" />;
  }
  if (generated) {
    return <Image source={generated as any} style={styles.episodeShowcaseArtwork} contentFit="cover" transition={0} />;
  }
  return <CatalogArtwork primary="" style={styles.episodeShowcaseArtwork} contentFit="cover" imageKind="backdrop" />;
}

`;

if (!source.includes('function ExactEpisodeArtwork({')) {
  if (!source.includes(helperMarker)) throw new Error('SeriesEpisodeShowcase marker missing');
  source = source.replace(helperMarker, helper + helperMarker);
}

// Repair the accidental self-recursion produced by the previous patch.
source = source.replace(
  'return <ExactEpisodeArtwork item={item} group={group} artwork={artwork} />;',
  'return <CatalogArtwork primary={artwork} style={styles.episodeShowcaseArtwork} contentFit="cover" imageKind="backdrop" />;',
);

// Replace only the renderer inside SeriesEpisodeShowcase, never the helper body.
const seriesStart = source.indexOf('function SeriesEpisodeShowcase({');
const downloadModalStart = source.indexOf('function DownloadOptionsModal({', seriesStart);
if (seriesStart < 0 || downloadModalStart < 0) throw new Error('SeriesEpisodeShowcase bounds missing');
const beforeSeries = source.slice(0, seriesStart);
let seriesBlock = source.slice(seriesStart, downloadModalStart);
const afterSeries = source.slice(downloadModalStart);
const oldRenderer = '<CatalogArtwork primary={artwork} style={styles.episodeShowcaseArtwork} contentFit="cover" imageKind="backdrop" />';
const newRenderer = '<ExactEpisodeArtwork item={item} group={group} artwork={artwork} />';
if (!seriesBlock.includes(newRenderer)) {
  if (!seriesBlock.includes(oldRenderer)) throw new Error('Episode artwork renderer target missing');
  seriesBlock = seriesBlock.replace(oldRenderer, newRenderer);
}
source = beforeSeries + seriesBlock + afterSeries;

await fs.writeFile(path, source, 'utf8');

for (const file of ['package.json', 'app.json']) {
  let text = await fs.readFile(file, 'utf8');
  text = text.replace(/"version": "0\.15\.5"/, '"version": "0.15.6"');
  if (file === 'app.json') text = text.replace(/"versionCode": 25/, '"versionCode": 26');
  await fs.writeFile(file, text, 'utf8');
}

const test = `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('missing episode art is generated from the exact episode playback URL on device', () => {
  assert.ok(source.includes("createVideoPlayer(exactSource)"));
  assert.ok(source.includes("player.generateThumbnailsAsync([requestedTime], { maxWidth: 640 })"));
  assert.ok(source.includes("playableVersionsFor(item, group)"));
  assert.ok(source.includes("exactEpisodeThumbnailQueue"));
  assert.ok(source.includes("player.release()"));
});

test('episode artwork helper cannot recursively render itself', () => {
  const start = source.indexOf('function ExactEpisodeArtwork({');
  const end = source.indexOf('function SeriesEpisodeShowcase({', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('primary={artwork}'));
  assert.ok(block.includes('primary=""'));
  assert.ok(!block.includes('return <ExactEpisodeArtwork'));
  assert.ok(!block.includes('item.poster'));
  assert.ok(!block.includes('item.backdrop'));
});

test('series episode cards use the exact episode artwork helper', () => {
  const start = source.indexOf('function SeriesEpisodeShowcase({');
  const end = source.indexOf('function DownloadOptionsModal({', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('<ExactEpisodeArtwork item={item} group={group} artwork={artwork} />'));
});

test('episode thumbnail work is serialized and cached for performance', () => {
  assert.ok(source.includes('const exactEpisodeThumbnailCache = new Map'));
  assert.ok(source.includes('let exactEpisodeThumbnailQueue: Promise<void> = Promise.resolve()'));
  assert.ok(source.includes('exactEpisodeThumbnailQueue = exactEpisodeThumbnailQueue'));
});
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile('scripts/tests/exact-device-episode-thumbnails.test.mjs', test, 'utf8');

console.log('Repaired exact episode artwork rendering and bumped app to 0.15.6.');
