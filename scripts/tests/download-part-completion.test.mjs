import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/downloadManager.ts', 'utf8');

test('completed temporary video files are validated without the .part suffix', () => {
  assert.ok(source.includes("replace(/\\.part(?=$|[?#])/i, '')"));
  assert.match(source, /!hasVideoExtension\(result\.uri, record\.sourceUrl\)/);
  assert.doesNotMatch(source, /!VIDEO_EXTENSION_RE\.test\(result\.uri\)/);
});

test('a valid completed download still moves to its permanent video destination', () => {
  assert.match(source, /await FileSystem\.moveAsync\(\{ from: result\.uri, to: finalDestination \}\)/);
  assert.match(source, /return \{ localUri: finalDestination, destinationUri: finalDestination, paused: false/);
});
