import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');

test('next episode overlay keeps unique episode art but never renders blank when it is missing', () => {
  assert.match(app, /primary=\{exactEpisodeArtworkFor\(nextEpisodeGroup, item\)\}/);
  assert.match(app, /fallback=\{item\.backdropFallback \|\| item\.backdrop \|\| item\.posterFallback \|\| item\.poster\}/);
  assert.match(app, /localFallback=\{localArtworkForItem\(item\)\}/);
});
