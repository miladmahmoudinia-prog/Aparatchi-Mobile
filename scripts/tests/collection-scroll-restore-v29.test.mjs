import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('App.tsx', 'utf8');

test('collection browser restores the tapped folder anchor and exact pixel offset after Back', () => {
  assert.match(source, /let collectionBrowserScrollSnapshot: GridScrollSnapshot = \{ offset: 0 \};/);
  assert.match(source, /const collectionFoldersRef = useRef<FlatList<any>>\(null\);/);
  assert.match(source, /anchorId: group\.id,/);
  assert.match(source, /anchorIndex: index,/);
  assert.match(source, /snapshot\.offset \+ \(nextRow - previousRow\) \* folderRowHeight/);
  assert.match(source, /if \(!collectionFoldersVisibleRef\.current \|\| restoringCollectionFolderOffsetRef\.current\) return;/);
  assert.match(source, /scrollToOffset\(\{ offset, animated: false \}\)/);
  assert.doesNotMatch(source, /contentOffset=\{\{ x: 0, y: collectionBrowserScrollOffset \}\}/);
  assert.match(source, /onScroll=\{rememberCollectionFolderOffset\}/);
  assert.match(source, /onScrollEndDrag=\{rememberCollectionFolderOffset\}/);
  assert.match(source, /onMomentumScrollEnd=\{rememberCollectionFolderOffset\}/);
});

test('category and category-result grids ignore hidden or programmatic zero-offset events', () => {
  assert.match(source, /if \(!isActive \|\| deferredQuery \|\| restoringCategoriesOffsetRef\.current\) return;/);
  assert.match(source, /const catalogListScrollSnapshots = new Map<string, GridScrollSnapshot>\(\);/);
  assert.match(source, /anchorId: String\(item\.id\),/);
  assert.match(source, /snapshot\.offset \+ \(nextRow - previousRow\) \* rowHeight/);
  assert.match(source, /if \(query \|\| restoringCatalogOffsetRef\.current \|\| openingCatalogItemRef\.current\) return;/);
});

test('collections are not published under an English, mixed, or guessed Persian-line title', () => {
  assert.match(source, /const hasUsablePersianCollectionLabel/);
  assert.match(source, /if \(!hasUsablePersianCollectionLabel\(rawCollectionFa\)\) return null;/);
  assert.match(source, /filter\(\(group\) => group\.members\.length >= 2 && Boolean\(group\.titleFa\)\)/);
  assert.doesNotMatch(source, /`مجموعه \$\{firstFa \|\| 'فیلم‌ها'\}`/);
});
