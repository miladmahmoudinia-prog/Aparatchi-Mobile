'use strict';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (label === 'collection scroll callback' && source.includes('const rememberCollectionFolderOffset = useCallback')) return source;
  if (label === 'collection scroll restore' && source.includes('onScroll={rememberCollectionFolderOffset}')) return source;
  if (label === 'collection folder identity' && source.includes("firstFa && hasPersianScript(firstFa)")) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one source anchor, found ${count}`);
  }
  return source.replace(before, after);
}

function applyMobileSourcePatches(input) {
  let source = String(input ?? '');

  source = replaceOnce(
    source,
    "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\n",
    "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\nlet collectionBrowserScrollOffset = 0;\n",
    'collection scroll state',
  );

  source = replaceOnce(
    source,
    "  const posterBadges = itemPosterBadges(item);\n  const latestEpisode = item.type === 'series' ? newestEpisodeGroup(item) : null;\n  const latestEpisodeMeta = latestEpisode || item.latestEpisode || null;\n  const posterNameFa = /[A-Za-z]/.test(item.nameFa || '') && item.collectionNameFa\n    ? `${item.collectionNameFa}${item.collectionOrder ? ` ${toPersianDigits(item.collectionOrder)}` : ''}`\n    : item.nameFa;\n",
    "  const posterBadges = itemPosterBadges(item);\n  // Prefer compact catalog metadata. Sorting every episode group while a poster\n  // is being mounted makes taps feel delayed on large series shelves.\n  const latestEpisodeMeta = item.latestEpisode || (item.type === 'series' ? newestEpisodeGroup(item) : null);\n  // A movie/series title must never be replaced by its collection label.\n  const posterNameFa = String(item.nameFa || '').trim() || item.name;\n",
    'poster own-title and latest episode fast path',
  );

  source = replaceOnce(
    source,
    "  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : `مجموعه ${String(members[0]?.nameFa || item.nameFa || 'فیلم‌ها').trim()}`;\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn)\n    ? rawCollectionEn\n    : '';\n",
    "  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : rawCollectionEn || 'Collection';\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn) && rawCollectionEn !== collectionTitleFa\n    ? rawCollectionEn\n    : '';\n",
    'collection detail identity',
  );

  source = replaceOnce(
    source,
    "      // Never show an English-only collection name as the Persian line. If TMDB\n      // does not provide a Persian collection title, use a deterministic local\n      // label based on the first Persian movie title instead of bad machine text.\n      const firstFa = String(first?.nameFa || '').trim();\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : `مجموعه ${firstFa || 'فیلم‌ها'}`;\n",
    "      // Collection identity belongs to collection metadata. If no verified\n      // Persian collection title exists, keep the original collection name\n      // instead of borrowing one child/installment title.\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : titleEn;\n",
    'collection folder identity',
  );

  source = replaceOnce(
    source,
    "  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  useEffect(() => {\n",
    "  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  const rememberCollectionBrowserOffset = useCallback((event: any) => {\n    collectionBrowserScrollOffset = Math.max(0, Number(event.nativeEvent.contentOffset.y || 0));\n  }, []);\n\n  useEffect(() => {\n",
    'collection scroll callback',
  );

  source = replaceOnce(
    source,
    "      initialNumToRender={6}\n      maxToRenderPerBatch={4}\n      windowSize={5}\n      removeClippedSubviews={false}\n      showsVerticalScrollIndicator={false}\n    />\n  );\n}\n\nfunction SearchScreen(props: {\n",
    "      initialNumToRender={6}\n      maxToRenderPerBatch={4}\n      windowSize={5}\n      removeClippedSubviews={false}\n      showsVerticalScrollIndicator={false}\n      contentOffset={{ x: 0, y: collectionBrowserScrollOffset }}\n      scrollEventThrottle={32}\n      onScroll={rememberCollectionBrowserOffset}\n      onScrollEndDrag={rememberCollectionBrowserOffset}\n      onMomentumScrollEnd={rememberCollectionBrowserOffset}\n    />\n  );\n}\n\nfunction SearchScreen(props: {\n",
    'collection scroll restore',
  );

  source = replaceOnce(
    source,
    "        renderItem={({ item: relatedItem }) => (\n          <Pressable style={styles.relatedTitleCard} onPress={() => onOpen(relatedItem)}>\n            <CatalogArtwork\n              primary={relatedItem.poster}\n              fallback={relatedItem.posterFallback}\n              style={styles.relatedTitlePoster}\n              contentFit=\"cover\"\n              imageKind=\"poster\"\n            />\n            <Text numberOfLines={1} style={styles.relatedTitleName}>{relatedItem.nameFa}</Text>\n            {Number(relatedItem.rate || 0) > 0 ? (\n              <View style={styles.relatedTitleRate}>\n                <Ionicons name=\"star\" color={COLORS.gold} size={11} />\n                <Text style={styles.relatedTitleRateText}>{toPersianDigits(Number(relatedItem.rate).toFixed(1))}</Text>\n              </View>\n            ) : null}\n          </Pressable>\n        )}\n",
    "        renderItem={({ item: relatedItem }) => {\n          const relatedBadges = itemPosterBadges(relatedItem);\n          return (\n            <Pressable style={styles.relatedTitleCard} onPress={() => onOpen(relatedItem)}>\n              <View style={styles.relatedTitlePoster}>\n                <CatalogArtwork\n                  primary={relatedItem.poster}\n                  fallback={relatedItem.posterFallback}\n                  style={styles.relatedTitlePoster}\n                  contentFit=\"cover\"\n                  imageKind=\"poster\"\n                />\n                {relatedBadges.length ? (\n                  <View pointerEvents=\"none\" style={styles.posterAccessStack}>\n                    {relatedBadges.map((badge) => (\n                      <View\n                        key={badge.id}\n                        style={[styles.posterAccess, badge.kind === 'operator' && styles.posterOperatorAccess]}\n                      >\n                        <Text\n                          style={[styles.posterAccessText, badge.kind === 'operator' && styles.posterOperatorAccessText]}\n                        >\n                          {badge.label}\n                        </Text>\n                      </View>\n                    ))}\n                  </View>\n                ) : null}\n              </View>\n              <Text numberOfLines={1} style={styles.relatedTitleName}>{relatedItem.nameFa || relatedItem.name}</Text>\n              {Number(relatedItem.rate || 0) > 0 ? (\n                <View style={styles.relatedTitleRate}>\n                  <Ionicons name=\"star\" color={COLORS.gold} size={11} />\n                  <Text style={styles.relatedTitleRateText}>{toPersianDigits(Number(relatedItem.rate).toFixed(1))}</Text>\n                </View>\n              ) : null}\n            </Pressable>\n          );\n        }}\n",
    'related title badges',
  );

  source = replaceOnce(
    source,
    "        initialNumToRender={10}\n        maxToRenderPerBatch={10}\n        updateCellsBatchingPeriod={32}\n        windowSize={7}\n        removeClippedSubviews={false}\n        nestedScrollEnabled\n",
    "        initialNumToRender={6}\n        maxToRenderPerBatch={4}\n        updateCellsBatchingPeriod={64}\n        windowSize={4}\n        removeClippedSubviews={false}\n        nestedScrollEnabled\n",
    'Home stars people batching',
  );

  source = replaceOnce(
    source,
    "          initialNumToRender={6}\n          maxToRenderPerBatch={6}\n          updateCellsBatchingPeriod={35}\n          windowSize={5}\n          removeClippedSubviews={false}\n          nestedScrollEnabled\n",
    "          initialNumToRender={4}\n          maxToRenderPerBatch={3}\n          updateCellsBatchingPeriod={64}\n          windowSize={4}\n          removeClippedSubviews={false}\n          nestedScrollEnabled\n",
    'Home stars works batching',
  );

  source = replaceOnce(
    source,
    "        initialNumToRender={4}\n        maxToRenderPerBatch={3}\n        updateCellsBatchingPeriod={40}\n        windowSize={5}\n        removeClippedSubviews={false}\n        keyboardShouldPersistTaps=\"always\"\n",
    "        initialNumToRender={3}\n        maxToRenderPerBatch={2}\n        updateCellsBatchingPeriod={64}\n        windowSize={4}\n        removeClippedSubviews\n        keyboardShouldPersistTaps=\"always\"\n",
    'vertical Home virtualization',
  );

  return source;
}

module.exports = { applyMobileSourcePatches, replaceOnce };
