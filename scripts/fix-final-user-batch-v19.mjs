import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\n",
  "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\nlet collectionBrowserScrollOffset = 0;\n",
  'collection scroll global',
);

replaceOnce(
  "  const posterNameFa = /[A-Za-z]/.test(item.nameFa || '') && item.collectionNameFa\n    ? `${item.collectionNameFa}${item.collectionOrder ? ` ${toPersianDigits(item.collectionOrder)}` : ''}`\n    : item.nameFa;\n",
  "  // A work card must always own its title. Collection identity never substitutes\n  // for a movie/series title; Content already falls back to the original title\n  // when a verified Persian title is unavailable.\n  const posterNameFa = String(item.nameFa || item.name || '').trim();\n",
  'poster own title',
);

replaceOnce(
  "  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : `مجموعه ${String(members[0]?.nameFa || item.nameFa || 'فیلم‌ها').trim()}`;\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn)\n    ? rawCollectionEn\n    : '';\n",
  "  const collectionTitleFa = rawCollectionFa && hasPersianScript(rawCollectionFa)\n    ? rawCollectionFa\n    : rawCollectionEn || 'Collection';\n  const collectionTitleEn = rawCollectionEn && !hasPersianScript(rawCollectionEn) && rawCollectionEn !== collectionTitleFa\n    ? rawCollectionEn\n    : '';\n",
  'detail collection identity',
);

replaceOnce(
  "      // Never show an English-only collection name as the Persian line. If TMDB\n      // does not provide a Persian collection title, use a deterministic local\n      // label based on the first Persian movie title instead of bad machine text.\n      const firstFa = String(first?.nameFa || '').trim();\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : `مجموعه ${firstFa || 'فیلم‌ها'}`;\n",
  "      // Collection identity must come from collection metadata only. If a\n      // verified Persian collection title is unavailable, the original collection\n      // name is safer than borrowing a member/installment title.\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : titleEn;\n",
  'collection folder identity',
);

replaceOnce(
  "  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  useEffect(() => {\n",
  "  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  const rememberCollectionBrowserOffset = useCallback((event: any) => {\n    collectionBrowserScrollOffset = Math.max(0, Number(event.nativeEvent.contentOffset.y || 0));\n  }, []);\n\n  useEffect(() => {\n",
  'collection offset callback',
);

replaceOnce(
  "      initialNumToRender={6}\n      maxToRenderPerBatch={4}\n      windowSize={5}\n      removeClippedSubviews={false}\n      showsVerticalScrollIndicator={false}\n    />\n  );\n}\n\nfunction SearchScreen(props: {\n",
  "      initialNumToRender={6}\n      maxToRenderPerBatch={4}\n      windowSize={5}\n      removeClippedSubviews={false}\n      showsVerticalScrollIndicator={false}\n      contentOffset={{ x: 0, y: collectionBrowserScrollOffset }}\n      scrollEventThrottle={32}\n      onScroll={rememberCollectionBrowserOffset}\n      onScrollEndDrag={rememberCollectionBrowserOffset}\n      onMomentumScrollEnd={rememberCollectionBrowserOffset}\n    />\n  );\n}\n\nfunction SearchScreen(props: {\n",
  'collection folder scroll restore',
);

replaceOnce(
  "        renderItem={({ item: relatedItem }) => (\n          <Pressable style={styles.relatedTitleCard} onPress={() => onOpen(relatedItem)}>\n            <CatalogArtwork\n              primary={relatedItem.poster}\n              fallback={relatedItem.posterFallback}\n              style={styles.relatedTitlePoster}\n              contentFit=\"cover\"\n              imageKind=\"poster\"\n            />\n            <Text numberOfLines={1} style={styles.relatedTitleName}>{relatedItem.nameFa}</Text>\n            {Number(relatedItem.rate || 0) > 0 ? (\n              <View style={styles.relatedTitleRate}>\n                <Ionicons name=\"star\" color={COLORS.gold} size={11} />\n                <Text style={styles.relatedTitleRateText}>{toPersianDigits(Number(relatedItem.rate).toFixed(1))}</Text>\n              </View>\n            ) : null}\n          </Pressable>\n        )}\n",
  "        renderItem={({ item: relatedItem }) => {\n          const relatedBadges = itemPosterBadges(relatedItem);\n          return (\n            <Pressable style={styles.relatedTitleCard} onPress={() => onOpen(relatedItem)}>\n              <CatalogArtwork\n                primary={relatedItem.poster}\n                fallback={relatedItem.posterFallback}\n                style={styles.relatedTitlePoster}\n                contentFit=\"cover\"\n                imageKind=\"poster\"\n              />\n              {relatedBadges.length ? (\n                <View pointerEvents=\"none\" style={styles.posterAccessStack}>\n                  {relatedBadges.map((badge) => (\n                    <View\n                      key={badge.id}\n                      style={[styles.posterAccess, badge.kind === 'operator' && styles.posterOperatorAccess]}\n                    >\n                      <Text style={[styles.posterAccessText, badge.kind === 'operator' && styles.posterOperatorAccessText]}>\n                        {badge.label}\n                      </Text>\n                    </View>\n                  ))}\n                </View>\n              ) : null}\n              <Text numberOfLines={1} style={styles.relatedTitleName}>{relatedItem.nameFa || relatedItem.name}</Text>\n              {Number(relatedItem.rate || 0) > 0 ? (\n                <View style={styles.relatedTitleRate}>\n                  <Ionicons name=\"star\" color={COLORS.gold} size={11} />\n                  <Text style={styles.relatedTitleRateText}>{toPersianDigits(Number(relatedItem.rate).toFixed(1))}</Text>\n                </View>\n              ) : null}\n            </Pressable>\n          );\n        }}\n",
  'related badges',
);

await fs.writeFile(path, source);
console.log('final user batch v19 App.tsx patch applied');
