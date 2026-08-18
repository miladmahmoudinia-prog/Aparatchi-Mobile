import fs from 'node:fs';

const file = 'App.tsx';
let source = fs.readFileSync(file, 'utf8');

const replaceExactlyOnce = (before, after, label) => {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) {
    console.log(`[v18] ${label}: already patched`);
    return;
  }
  if (count !== 1) {
    throw new Error(`[v18] ${label}: expected exactly one source match, found ${count}`);
  }
  source = source.replace(before, after);
  console.log(`[v18] ${label}: patched`);
};

replaceExactlyOnce(
  `  const posterNameFa = /[A-Za-z]/.test(item.nameFa || '') && item.collectionNameFa\n    ? \`${'${item.collectionNameFa}'}${'${item.collectionOrder ? ` ${toPersianDigits(item.collectionOrder)}` : \'\'}'}\`\n    : item.nameFa;`,
  `  // A movie/series card must always keep the work's own identity. Collection\n  // metadata is never a fallback title for an individual work.\n  const posterNameFa = String(item.nameFa || item.name || '').trim();`,
  'poster identity',
);

replaceExactlyOnce(
  `      // Never show an English-only collection name as the Persian line. If TMDB\n      // does not provide a Persian collection title, use a deterministic local\n      // label based on the first Persian movie title instead of bad machine text.\n      const firstFa = String(first?.nameFa || '').trim();\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : \`مجموعه ${'${firstFa || \'فیلم‌ها\'}'}\`;`,
  `      // Keep collection identity separate from member identity. If there is no\n      // verified Persian collection name, show the original collection title; do\n      // not manufacture a collection label from the first movie/series title.\n      const titleFa = rawFa && hasPersianScript(rawFa)\n        ? rawFa\n        : titleEn;`,
  'collection identity',
);

replaceExactlyOnce(
  `  const cardWidth = Math.floor((screenWidth - 32 - gap * (columns - 1)) / columns);\n\n  const setSelectedCollectionId = useCallback((next: string | null) => {`,
  `  const cardWidth = Math.floor((screenWidth - 32 - gap * (columns - 1)) / columns);\n  // The folder grid is temporarily unmounted while a collection is open. Keep\n  // the exact native offset in refs so Back restores the same visual position.\n  const folderScrollOffsetRef = useRef(0);\n  const folderListRef = useRef<FlatList<any> | null>(null);\n\n  const setSelectedCollectionId = useCallback((next: string | null) => {`,
  'folder scroll refs',
);

replaceExactlyOnce(
  `    <FlatList\n      key={\`collection-folders-${'${columns}'}\`}\n      data={groups}\n      numColumns={columns}\n      keyExtractor={(group) => group.id}\n      style={styles.screen}\n      contentContainerStyle={styles.catalogListContent}`,
  `    <FlatList\n      ref={folderListRef}\n      key={\`collection-folders-${'${columns}'}\`}\n      data={groups}\n      numColumns={columns}\n      keyExtractor={(group) => group.id}\n      style={styles.screen}\n      contentContainerStyle={styles.catalogListContent}\n      contentOffset={{ x: 0, y: folderScrollOffsetRef.current }}\n      onScroll={(event) => {\n        folderScrollOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y);\n      }}\n      scrollEventThrottle={16}\n      onLayout={() => {\n        const offset = folderScrollOffsetRef.current;\n        if (offset <= 0) return;\n        requestAnimationFrame(() => {\n          folderListRef.current?.scrollToOffset({ offset, animated: false });\n        });\n      }}`,
  'exact collection folder scroll restore',
);

const forbidden = [
  "[A-Za-z]/.test(item.nameFa || '') && item.collectionNameFa",
  "const firstFa = String(first?.nameFa || '').trim();",
  ": `مجموعه ${firstFa || 'فیلم‌ها'}`",
];
for (const marker of forbidden) {
  if (source.includes(marker)) throw new Error(`[v18] forbidden title fallback remains: ${marker}`);
}
for (const marker of [
  "const posterNameFa = String(item.nameFa || item.name || '').trim();",
  'const folderScrollOffsetRef = useRef(0);',
  'contentOffset={{ x: 0, y: folderScrollOffsetRef.current }}',
  'folderListRef.current?.scrollToOffset({ offset, animated: false });',
]) {
  if (!source.includes(marker)) throw new Error(`[v18] required regression marker missing: ${marker}`);
}

fs.writeFileSync(file, source);
console.log('[v18] App.tsx title identity + exact collection scroll repair complete');
