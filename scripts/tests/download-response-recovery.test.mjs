import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../../src/downloadManager.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '');
let response;
let size;
let expected;
const fsMock = {
  documentDirectory: 'file:///test/',
  getInfoAsync: async () => ({ exists: true, size }),
  deleteAsync: async () => {},
  moveAsync: async () => {},
  FileSystemSessionType: { BACKGROUND: 0 },
  createDownloadResumable: (_url, uri, _options, progress) => ({
    downloadAsync: async () => {
      progress({ totalBytesWritten: size, totalBytesExpectedToWrite: expected });
      return { uri, ...response };
    },
  }),
};
globalThis.__downloadTestFs = fsMock;
const js = stripTypeScriptTypes(source, { mode: 'transform' });
const { runDownload } = await import(`data:text/javascript;base64,${Buffer.from(
  'const FileSystem = globalThis.__downloadTestFs;\n' + js,
).toString('base64')}`);
const record = {
  id: 'one', itemId: 'movie', title: 'Movie', subtitle: '', quality: '480',
  sourceUrl: 'https://example.com/movie.mp4', progress: 0, status: 'downloading',
  createdAt: '', totalBytes: 9_000_000,
};
const run = () => runDownload({ record, onProgress() {} });

test('valid video uses live transfer size, not stale catalog size', async () => {
  response = { status: 200, headers: { 'Content-Type': 'video/mp4' } };
  size = expected = 1_000_000;
  const result = await run();
  assert.ok(result.localUri?.endsWith('.mp4'));
  assert.equal(result.paused, false);
});

test('403 is retryable and clears invalid resume state, not missing file', async () => {
  response = { status: 403, headers: { 'Content-Type': 'text/html' } };
  size = expected = 400;
  const result = await run();
  assert.equal(result.unavailable, false);
  assert.equal(result.paused, true);
  assert.equal(result.resetTransfer, true);
  assert.match(result.error, /403/);
});

test('404 reports a genuinely missing file', async () => {
  response = { status: 404 };
  const result = await run();
  assert.equal(result.unavailable, true);
});

test('HTML with HTTP 200 is never accepted as video', async () => {
  response = { status: 200, headers: { 'content-type': 'text/html' } };
  size = expected = 1_000_000;
  const result = await run();
  assert.equal(result.localUri, undefined);
  assert.equal(result.resetTransfer, true);
  assert.match(result.error, /text\/html/);
});

test('incomplete transfer remains paused', async () => {
  response = { status: 200, headers: { 'content-type': 'video/mp4' } };
  size = 1_000_000;
  expected = 2_000_000;
  assert.equal((await run()).paused, true);
});
