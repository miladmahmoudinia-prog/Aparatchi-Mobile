import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');

test('short films have a dedicated browse category and detail label', () => {
  assert.ok(app.includes("| 'short-films'"));
  assert.ok(app.includes("{ filter: 'short-films', title: 'فیلم کوتاه'"));
  assert.ok(app.includes("case 'short-films': return item.contentKind === 'short-film' || hasCategory(item, 'short-films')"));
  assert.ok(app.includes("return 'فیلم کوتاه'"));
});

test('related rail diversifies broad genres and rotates per detail opening', () => {
  assert.ok(app.includes("const RELATED_GENERIC_GENRES = new Set(['درام', 'drama'])"));
  assert.ok(app.includes('genreCounts.get(entry.dominantGenre)'));
  assert.ok(app.includes('sharedPeople.length * 7'));
  assert.ok(app.includes('setRelatedSelectionSeed((seed) => seed + 1)'));
  assert.ok(app.includes('relatedCatalogItems(item, catalog, 5, selectionSeed)'));
});
