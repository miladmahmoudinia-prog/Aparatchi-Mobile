import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.tsx', 'utf8');

test('related playback replaces media without remounting or changing orientation', () => {
  assert.ok(app.includes('await player.replaceAsync(initialSource.url);'));
  assert.ok(app.includes('previousRequestIdentityRef.current === requestIdentity'));
  assert.ok(!app.includes('key={`${videoRequest.itemId'));
  const replacement = app.slice(
    app.indexOf('// A related-title selection changes the media inside the existing player.'),
    app.indexOf('const retryNetworkPlayback', app.indexOf('// A related-title selection changes the media inside the existing player.')),
  );
  assert.ok(!replacement.includes('ScreenOrientation.lockAsync'));
});

test('closing the player remains the only recommendation-adjacent portrait lock', () => {
  const close = app.slice(app.indexOf('const closePlayer = () => {'), app.indexOf('const handleBack = () => {'));
  assert.ok(close.includes('OrientationLock.PORTRAIT_UP'));
});
