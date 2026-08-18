import fs from 'node:fs';

const path = 'App.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(pattern, replacement, label) {
  const next = source.replace(pattern, replacement);
  if (next === source) throw new Error(`patch target not found: ${label}`);
  source = next;
}

if (!source.includes('let collectionBrowserScrollOffset = 0;')) {
  replaceRequired(
    "let collectionBrowserSelectedId: string | null = null;",
    "let collectionBrowserSelectedId: string | null = null;\nlet collectionBrowserScrollOffset = 0;",
    'global collection scroll offset',
  );
}

if (!source.includes('const collectionFoldersRef = useRef<FlatList<any>>(null);')) {
  replaceRequired(
    "  const [selectedCollectionId, setSelectedCollectionIdState] = useState<string | null>(() => collectionBrowserSelectedId);\n  const { width: screenWidth } = useWindowDimensions();",
    "  const [selectedCollectionId, setSelectedCollectionIdState] = useState<string | null>(() => collectionBrowserSelectedId);\n  const collectionFoldersRef = useRef<FlatList<any>>(null);\n  const { width: screenWidth } = useWindowDimensions();",
    'collection folder list ref',
  );
}

if (!source.includes('const rememberCollectionFolderOffset = useCallback')) {
  replaceRequired(
    `  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  useEffect(() => {`,
    `  const setSelectedCollectionId = useCallback((next: string | null) => {\n    collectionBrowserSelectedId = next;\n    setSelectedCollectionIdState(next);\n  }, []);\n\n  const rememberCollectionFolderOffset = useCallback((event: any) => {\n    collectionBrowserScrollOffset = Math.max(0, Number(event?.nativeEvent?.contentOffset?.y || 0));\n  }, []);\n\n  useEffect(() => {\n    if (selectedCollectionId) return undefined;\n    const offset = Math.max(0, collectionBrowserScrollOffset);\n    const restore = () => collectionFoldersRef.current?.scrollToOffset({ offset, animated: false });\n    const frame = requestAnimationFrame(restore);\n    const retry = setTimeout(restore, 60);\n    const finalRetry = setTimeout(restore, 180);\n    return () => {\n      cancelAnimationFrame(frame);\n      clearTimeout(retry);\n      clearTimeout(finalRetry);\n    };\n  }, [selectedCollectionId, groups.length, columns]);\n\n  useEffect(() => {`,
    'exact collection folder offset memory and restore',
  );
}

if (!source.includes('onMomentumScrollEnd={rememberCollectionFolderOffset}')) {
  replaceRequired(
    `    <FlatList\n      key={\`collection-folders-\${columns}\`}\n      data={groups}\n      numColumns={columns}\n      keyExtractor={(group) => group.id}\n      style={styles.screen}\n      contentContainerStyle={styles.catalogListContent}`,
    `    <FlatList\n      ref={collectionFoldersRef}\n      key={\`collection-folders-\${columns}\`}\n      data={groups}\n      numColumns={columns}\n      keyExtractor={(group) => group.id}\n      style={styles.screen}\n      contentOffset={{ x: 0, y: collectionBrowserScrollOffset }}\n      scrollEventThrottle={16}\n      onScroll={rememberCollectionFolderOffset}\n      onScrollEndDrag={rememberCollectionFolderOffset}\n      onMomentumScrollEnd={rememberCollectionFolderOffset}\n      contentContainerStyle={styles.catalogListContent}`,
    'collection folder FlatList offset hooks',
  );
}

fs.writeFileSync(path, source);
console.log(JSON.stringify({ patched: true, collectionBrowserScrollOffset: true }, null, 2));
