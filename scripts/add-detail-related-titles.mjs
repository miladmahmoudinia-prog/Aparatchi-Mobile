import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (oldText, newText, label) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
};

if (source.includes('function RelatedTitlesSection(')) {
  console.log('Detail related titles already applied.');
  process.exit(0);
}

const detailMarker = `function DetailModal({`;
const relatedComponent = `function RelatedTitlesSection({\n  item,\n  catalog,\n  onOpen,\n}: {\n  item: CatalogItem;\n  catalog: CatalogItem[];\n  onOpen: (item: CatalogItem) => void;\n}) {\n  const related = useMemo(() => relatedCatalogItems(item, catalog, 5), [item, catalog]);\n  const railRef = useRef<FlatList<CatalogItem>>(null);\n  if (!related.length) return null;\n\n  return (\n    <View style={styles.relatedTitlesSection}>\n      <View style={styles.relatedTitlesHeader}>\n        <View style={styles.relatedTitlesAccent} />\n        <Text style={styles.relatedTitlesTitle}>مرتبط‌ها</Text>\n      </View>\n      <FlatList\n        ref={railRef}\n        horizontal\n        data={[...related].reverse()}\n        onContentSizeChange={() => railRef.current?.scrollToEnd({ animated: false })}\n        keyExtractor={(relatedItem) => relatedItem.id}\n        renderItem={({ item: relatedItem }) => (\n          <Pressable style={styles.relatedTitleCard} onPress={() => onOpen(relatedItem)}>\n            <CatalogArtwork\n              primary={relatedItem.poster}\n              fallback={relatedItem.posterFallback}\n              style={styles.relatedTitlePoster}\n              contentFit="cover"\n              imageKind="poster"\n            />\n            <Text numberOfLines={1} style={styles.relatedTitleName}>{relatedItem.nameFa}</Text>\n            {Number(relatedItem.rate || 0) > 0 ? (\n              <View style={styles.relatedTitleRate}>\n                <Ionicons name="star" color={COLORS.gold} size={11} />\n                <Text style={styles.relatedTitleRateText}>{toPersianDigits(Number(relatedItem.rate).toFixed(1))}</Text>\n              </View>\n            ) : null}\n          </Pressable>\n        )}\n        contentContainerStyle={styles.relatedTitlesRail}\n        showsHorizontalScrollIndicator={false}\n        initialNumToRender={5}\n        maxToRenderPerBatch={5}\n        windowSize={3}\n      />\n    </View>\n  );\n}\n\n`;
replaceOnce(detailMarker, relatedComponent + detailMarker, 'related component insertion');

replaceOnce(
`            <PeopleSection item={item} onOpen={onOpenPerson} />\n            <MovieCollectionSection item={item} catalog={catalog} onOpen={onOpenRelated} />`,
`            <PeopleSection item={item} onOpen={onOpenPerson} />\n            <MovieCollectionSection item={item} catalog={catalog} onOpen={onOpenRelated} />\n            <RelatedTitlesSection item={item} catalog={catalog} onOpen={onOpenRelated} />`,
  'related section detail placement',
);

replaceOnce(
`  playerOfflineOverlay: { position: 'absolute', zIndex: 95, elevation: 95, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.78)' },`,
`  relatedTitlesSection: { marginTop: 22, marginBottom: 8 },\n  relatedTitlesHeader: { minHeight: 36, flexDirection: 'row-reverse', alignItems: 'center', gap: 9, marginBottom: 12, paddingHorizontal: 4 },\n  relatedTitlesAccent: { width: 34, height: 2, borderRadius: 2, backgroundColor: COLORS.red },\n  relatedTitlesTitle: { ...rtlText, color: COLORS.text, fontSize: 18, fontWeight: '900' },\n  relatedTitlesRail: { flexDirection: 'row', gap: 12, paddingHorizontal: 2, paddingBottom: 5 },\n  relatedTitleCard: { width: 126, alignItems: 'flex-end' },\n  relatedTitlePoster: { width: 126, height: 178, borderRadius: 14, backgroundColor: COLORS.surfaceStrong },\n  relatedTitleName: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 10.5, fontWeight: '800', textAlign: 'right', marginTop: 7 },\n  relatedTitleRate: { position: 'absolute', left: 7, top: 148, height: 24, paddingHorizontal: 7, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,7,10,0.86)' },\n  relatedTitleRateText: { color: '#fff', fontSize: 8.5, fontWeight: '900' },\n  playerOfflineOverlay: { position: 'absolute', zIndex: 95, elevation: 95, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(0,0,0,0.78)' },`,
  'related section styles',
);

await fs.writeFile(path, source, 'utf8');
console.log('Detail related titles patch applied.');
