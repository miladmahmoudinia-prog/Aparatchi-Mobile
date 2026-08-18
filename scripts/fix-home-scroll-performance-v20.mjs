import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  source = source.replace(before, after);
}

// Poster cards are mounted continuously while Home is flinging. Prefer the
// summary's precomputed latestEpisode and only inspect/sort full downloads when
// older catalog data truly lacks that summary field.
replaceOnce(
  "  const latestEpisode = item.type === 'series' ? newestEpisodeGroup(item) : null;\n  const latestEpisodeMeta = latestEpisode || item.latestEpisode || null;\n",
  "  const latestEpisodeMeta = item.type === 'series'\n    ? (item.latestEpisode || newestEpisodeGroup(item))\n    : null;\n",
  'poster latest episode fast path',
);

// Keep the giant Home header small. The first three real shelves remain ready,
// while the rest (especially the stars-heavy foreign-movie section) are normal
// virtualized cells instead of permanent header children.
replaceOnce(
  "  const eagerRows = useMemo(() => populatedRows.slice(0, 4), [populatedRows]);\n  const deferredRows = useMemo(() => populatedRows.slice(4), [populatedRows]);\n",
  "  const eagerRows = useMemo(() => populatedRows.slice(0, 3), [populatedRows]);\n  const deferredRows = useMemo(() => populatedRows.slice(3), [populatedRows]);\n",
  'home eager row count',
);

// Horizontal rails previously kept every native poster view attached even when
// far outside the screen. That becomes expensive after several Home rows have
// been visited. Clip aggressively and mount in smaller batches.
replaceOnce(
  "      initialNumToRender={4}\n      maxToRenderPerBatch={4}\n      updateCellsBatchingPeriod={50}\n      windowSize={4}\n      removeClippedSubviews={false}\n      nestedScrollEnabled\n",
  "      initialNumToRender={3}\n      maxToRenderPerBatch={2}\n      updateCellsBatchingPeriod={64}\n      windowSize={3}\n      removeClippedSubviews\n      nestedScrollEnabled\n",
  'horizontal home rail virtualization',
);

// The stars shelf can contain ~60 avatars plus many work posters. Keep only its
// visible neighborhood attached so vertical Home movement does not carry a
// large off-screen image tree with it.
replaceOnce(
  "        initialNumToRender={10}\n        maxToRenderPerBatch={10}\n        updateCellsBatchingPeriod={32}\n        windowSize={7}\n        removeClippedSubviews={false}\n        nestedScrollEnabled\n",
  "        initialNumToRender={6}\n        maxToRenderPerBatch={4}\n        updateCellsBatchingPeriod={64}\n        windowSize={4}\n        removeClippedSubviews\n        nestedScrollEnabled\n",
  'star people virtualization',
);

replaceOnce(
  "          initialNumToRender={6}\n          maxToRenderPerBatch={6}\n          updateCellsBatchingPeriod={35}\n          windowSize={5}\n          removeClippedSubviews={false}\n          nestedScrollEnabled\n",
  "          initialNumToRender={4}\n          maxToRenderPerBatch={3}\n          updateCellsBatchingPeriod={64}\n          windowSize={4}\n          removeClippedSubviews\n          nestedScrollEnabled\n",
  'star works virtualization',
);

// Vertical Home used a wide render window and explicitly disabled clipping.
// Smaller batches leave the JS/UI threads free for gesture frames and true
// clipping prevents already-visited rails from accumulating native image views.
replaceOnce(
  "        initialNumToRender={4}\n        maxToRenderPerBatch={3}\n        updateCellsBatchingPeriod={40}\n        windowSize={5}\n        removeClippedSubviews={false}\n        keyboardShouldPersistTaps=\"always\"\n",
  "        initialNumToRender={2}\n        maxToRenderPerBatch={2}\n        updateCellsBatchingPeriod={64}\n        windowSize={4}\n        removeClippedSubviews\n        keyboardShouldPersistTaps=\"always\"\n",
  'vertical home virtualization',
);

await fs.writeFile(path, source, 'utf8');
console.log('Home scroll performance v20 patch applied');
