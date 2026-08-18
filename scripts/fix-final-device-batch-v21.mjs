import fs from 'node:fs/promises';

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');

function applyOnce(before, after, label) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  source = source.replace(before, after);
}

// Collection folder scroll position must survive entering a collection and Back.
applyOnce(
  "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\n",
  "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\nlet collectionBrowserScrollOffset = 0;\n",
  'collection scroll global',
);

// A title card owns its title. Never substitute collection identity for a work title.
applyOnce(
  "  const posterNameFa = /[A-Za-z]/.test(item.nameFa || '') && item.collectionNameFa\n    ? `${item.collectionNameFa}${item.collectionOrder ? ` ${toPersianDigits(item.collectionOrder)}` : ''}`\n    : item.nameFa;\n",
  "  const posterNameFa = String(item.nameFa || item.name || '').trim();\n",
  'poster own title',
);

// Collection detail identity must come from collection metadata only.
applyOnce(
  "  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : `مجموعه ${String(members[0]?.nameFa || item.nameFa || 'فیلم‌ها').trim()}`;\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn)\n    ? rawCollectionEn\n    : '';\n",
  "  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : rawCollectionEn || 'Collection';\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn) && rawCollectionEn !== collectionTitleFa\n    ? rawCollectionEn\n    : '';\n",
  'detail collection identity',
);

applyOnce(
  "      // Never show an English-only collection name as the Persian line. If TMDB\n      // does not provide a Persian collection title, use a deterministic local\n      // label based on the first Persian movie title instead of bad machine text.\n      const firstFa = String(first?.nameFa || '').trim();\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : `مجموعه ${firstFa || 'فیلم‌ها'}`;\n",
  "      // Collection identity must come from collection metadata only. If a\n      // verified Persian collection title is unavailable, keep the original\n      // collection name instead of borrowing a member/installment title.\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : titleEn;\n",
  'collection folder identity',
);

applyOnce(
  "  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  useEffect(() => {\n",
  "  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  const rememberCollectionBrowserOffset = useCallback((event: any) => {\n    collectionBrowserScrollOffset = Math.max(0, Number(event.nativeEvent.contentOffset.y || 0));\n  }, []);\n\n  useEffect(() => {\n",
  'collection offset callback',
);

applyOnce(
  "      initialNumToRender={6}\n      maxToRenderPerBatch={4}\n      windowSize={5}\n      removeClippedSubviews={false}\n      showsVerticalScrollIndicator={false}\n    />\n  );\n}\n\nfunction SearchScreen(props: {\n",
  "      initialNumToRender={6}\n      maxToRenderPerBatch={4}\n      windowSize={5}\n      removeClippedSubviews={false}\n      showsVerticalScrollIndicator={false}\n      contentOffset={{ x: 0, y: collectionBrowserScrollOffset }}\n      scrollEventThrottle={32}\n      onScroll={rememberCollectionBrowserOffset}\n      onScrollEndDrag={rememberCollectionBrowserOffset}\n      onMomentumScrollEnd={rememberCollectionBrowserOffset}\n    />\n  );\n}\n\nfunction SearchScreen(props: {\n",
  'collection folder scroll restore',
);

// Related cards need the same truthful dubbed/subtitle/operator badges as normal cards.
applyOnce(
  "        renderItem={({ item: relatedItem }) => (\n          <Pressable style={styles.relatedTitleCard} onPress={() => onOpen(relatedItem)}>\n            <CatalogArtwork\n              primary={relatedItem.poster}\n              fallback={relatedItem.posterFallback}\n              style={styles.relatedTitlePoster}\n              contentFit=\"cover\"\n              imageKind=\"poster\"\n            />\n            <Text numberOfLines={1} style={styles.relatedTitleName}>{relatedItem.nameFa}</Text>\n            {Number(relatedItem.rate || 0) > 0 ? (\n              <View style={styles.relatedTitleRate}>\n                <Ionicons name=\"star\" color={COLORS.gold} size={11} />\n                <Text style={styles.relatedTitleRateText}>{toPersianDigits(Number(relatedItem.rate).toFixed(1))}</Text>\n              </View>\n            ) : null}\n          </Pressable>\n        )}\n",
  "        renderItem={({ item: relatedItem }) => {\n          const relatedBadges = itemPosterBadges(relatedItem);\n          return (\n            <Pressable style={styles.relatedTitleCard} onPress={() => onOpen(relatedItem)}>\n              <CatalogArtwork\n                primary={relatedItem.poster}\n                fallback={relatedItem.posterFallback}\n                style={styles.relatedTitlePoster}\n                contentFit=\"cover\"\n                imageKind=\"poster\"\n              />\n              {relatedBadges.length ? (\n                <View pointerEvents=\"none\" style={styles.posterAccessStack}>\n                  {relatedBadges.map((badge) => (\n                    <View key={badge.id} style={[styles.posterAccess, badge.kind === 'operator' && styles.posterOperatorAccess]}>\n                      <Text style={[styles.posterAccessText, badge.kind === 'operator' && styles.posterOperatorAccessText]}>\n                        {badge.label}\n                      </Text>\n                    </View>\n                  ))}\n                </View>\n              ) : null}\n              <Text numberOfLines={1} style={styles.relatedTitleName}>{relatedItem.nameFa || relatedItem.name}</Text>\n              {Number(relatedItem.rate || 0) > 0 ? (\n                <View style={styles.relatedTitleRate}>\n                  <Ionicons name=\"star\" color={COLORS.gold} size={11} />\n                  <Text style={styles.relatedTitleRateText}>{toPersianDigits(Number(relatedItem.rate).toFixed(1))}</Text>\n                </View>\n              ) : null}\n            </Pressable>\n          );\n        }}\n",
  'related badges',
);

// Home performance: prefer precomputed latest episode metadata before expensive fallback sorting.
applyOnce(
  "  const latestEpisode = item.type === 'series' ? newestEpisodeGroup(item) : null;\n  const latestEpisodeMeta = latestEpisode || item.latestEpisode || null;\n",
  "  const latestEpisodeMeta = item.type === 'series'\n    ? (item.latestEpisode || newestEpisodeGroup(item))\n    : null;\n",
  'poster latest episode fast path',
);

// Keep the previously verified RTL behavior: horizontal rails remain unclipped,
// but mount smaller batches so a fast vertical fling has less JS/image work.
applyOnce(
  "      initialNumToRender={4}\n      maxToRenderPerBatch={4}\n      updateCellsBatchingPeriod={50}\n      windowSize={4}\n      removeClippedSubviews={false}\n      nestedScrollEnabled\n",
  "      initialNumToRender={3}\n      maxToRenderPerBatch={2}\n      updateCellsBatchingPeriod={64}\n      windowSize={3}\n      removeClippedSubviews={false}\n      nestedScrollEnabled\n",
  'horizontal rail batch size',
);

applyOnce(
  "        initialNumToRender={10}\n        maxToRenderPerBatch={10}\n        updateCellsBatchingPeriod={32}\n        windowSize={7}\n        removeClippedSubviews={false}\n        nestedScrollEnabled\n",
  "        initialNumToRender={6}\n        maxToRenderPerBatch={4}\n        updateCellsBatchingPeriod={64}\n        windowSize={4}\n        removeClippedSubviews={false}\n        nestedScrollEnabled\n",
  'star people batch size',
);

applyOnce(
  "          initialNumToRender={6}\n          maxToRenderPerBatch={6}\n          updateCellsBatchingPeriod={35}\n          windowSize={5}\n          removeClippedSubviews={false}\n          nestedScrollEnabled\n",
  "          initialNumToRender={4}\n          maxToRenderPerBatch={3}\n          updateCellsBatchingPeriod={64}\n          windowSize={4}\n          removeClippedSubviews={false}\n          nestedScrollEnabled\n",
  'star works batch size',
);

// Only the outer vertical Home list uses native clipping. Sensitive horizontal
// RTL rails intentionally keep removeClippedSubviews=false per the stable state.
applyOnce(
  "        initialNumToRender={4}\n        maxToRenderPerBatch={3}\n        updateCellsBatchingPeriod={40}\n        windowSize={5}\n        removeClippedSubviews={false}\n        keyboardShouldPersistTaps=\"always\"\n",
  "        initialNumToRender={3}\n        maxToRenderPerBatch={2}\n        updateCellsBatchingPeriod={64}\n        windowSize={4}\n        removeClippedSubviews\n        keyboardShouldPersistTaps=\"always\"\n",
  'vertical home virtualization',
);

await fs.writeFile(appPath, source, 'utf8');

// Remove only the temporary collection guard. The startup content gate is a
// separate verified cold-start fix and must remain installed before App loads.
await fs.writeFile('index.ts', `import { registerRootComponent } from 'expo';\nimport { installStartupContentGate } from './src/startupContentGate';\n\ndeclare const require: (name: string) => any;\n\ninstallStartupContentGate();\n\nconst App = require('./App').default;\n\nregisterRootComponent(App);\n`, 'utf8');

console.log('final device batch v21 applied');
