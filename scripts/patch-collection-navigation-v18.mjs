import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

function replaceOnce(label, before, after) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  'collection scroll memory',
  "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\n",
  "let collectionBrowserBackHandler: (() => boolean) | null = null;\nlet collectionBrowserSelectedId: string | null = null;\nlet collectionBrowserScrollOffset = 0;\n",
);

replaceOnce(
  'never substitute collection title for movie title',
  "  const posterNameFa = /[A-Za-z]/.test(item.nameFa || '') && item.collectionNameFa\n    ? `${item.collectionNameFa}${item.collectionOrder ? ` ${toPersianDigits(item.collectionOrder)}` : ''}`\n    : item.nameFa;\n",
  "  // A movie title must always belong to the movie itself. Previously a missing/Latin\n  // Persian title was replaced by the collection label, which made entries such as\n  // Enola Holmes 2 appear as «مجموعه انولا هولمز». Content enrichment can repair\n  // missing Persian metadata; the UI must never invent a movie name from its folder.\n  const posterNameFa = item.nameFa;\n",
);

replaceOnce(
  'collection folder list ref',
  "  const [selectedCollectionId, setSelectedCollectionIdState] = useState<string | null>(() => collectionBrowserSelectedId);\n  const { width: screenWidth } = useWindowDimensions();\n",
  "  const [selectedCollectionId, setSelectedCollectionIdState] = useState<string | null>(() => collectionBrowserSelectedId);\n  const collectionFolderListRef = useRef<any>(null);\n  const { width: screenWidth } = useWindowDimensions();\n",
);

replaceOnce(
  'collection scroll restore effect',
  "  useEffect(() => {\n    if (selectedCollectionId && !groups.some((group) => group.id === selectedCollectionId)) {\n      setSelectedCollectionId(null);\n    }\n  }, [groups, selectedCollectionId, setSelectedCollectionId]);\n\n  if (selected) {\n",
  "  useEffect(() => {\n    if (selectedCollectionId && !groups.some((group) => group.id === selectedCollectionId)) {\n      setSelectedCollectionId(null);\n    }\n  }, [groups, selectedCollectionId, setSelectedCollectionId]);\n\n  useEffect(() => {\n    if (selectedCollectionId !== null || collectionBrowserScrollOffset <= 0) return;\n    const frame = requestAnimationFrame(() => {\n      collectionFolderListRef.current?.scrollToOffset({\n        offset: collectionBrowserScrollOffset,\n        animated: false,\n      });\n    });\n    return () => cancelAnimationFrame(frame);\n  }, [selectedCollectionId, columns, groups.length]);\n\n  if (selected) {\n",
);

replaceOnce(
  'collection folder list scroll tracking',
  "    <FlatList\n      key={`collection-folders-${columns}`}\n      data={groups}\n      numColumns={columns}\n      keyExtractor={(group) => group.id}\n      style={styles.screen}\n      contentContainerStyle={styles.catalogListContent}\n      columnWrapperStyle={columns > 1 ? { gap, flexDirection: 'row-reverse' } : undefined}\n",
  "    <FlatList\n      ref={collectionFolderListRef}\n      key={`collection-folders-${columns}`}\n      data={groups}\n      numColumns={columns}\n      keyExtractor={(group) => group.id}\n      style={styles.screen}\n      contentContainerStyle={styles.catalogListContent}\n      columnWrapperStyle={columns > 1 ? { gap, flexDirection: 'row-reverse' } : undefined}\n      onScroll={(event) => { collectionBrowserScrollOffset = event.nativeEvent.contentOffset.y; }}\n      scrollEventThrottle={32}\n",
);

await fs.writeFile(path, source, 'utf8');
console.log('Collection navigation v18 patch applied.');
