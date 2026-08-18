import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('App.tsx', 'utf8');

test('collection browser remembers and restores the exact pixel offset after Back', () => {
  assert.match(source, /let collectionBrowserScrollOffset = 0;/);
  assert.match(source, /const collectionFoldersRef = useRef<FlatList<any>>\(null\);/);
  assert.match(source, /collectionBrowserScrollOffset = Math\.max\(0, Number\(event\?\.nativeEvent\?\.contentOffset\?\.y \|\| 0\)\);/);
  assert.match(source, /scrollToOffset\(\{ offset, animated: false \}\)/);
  assert.match(source, /contentOffset=\{\{ x: 0, y: collectionBrowserScrollOffset \}\}/);
  assert.match(source, /onScroll=\{rememberCollectionFolderOffset\}/);
  assert.match(source, /onScrollEndDrag=\{rememberCollectionFolderOffset\}/);
  assert.match(source, /onMomentumScrollEnd=\{rememberCollectionFolderOffset\}/);
});
