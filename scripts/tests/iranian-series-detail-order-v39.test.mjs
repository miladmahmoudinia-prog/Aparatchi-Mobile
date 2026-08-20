import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync('App.tsx', 'utf8');

test('series episodes render before related titles on detail pages', () => {
  const detailStart = app.indexOf('function DetailModal({');
  const detailEnd = app.indexOf('const exactEpisodeArtworkFor', detailStart);
  const detail = app.slice(detailStart, detailEnd);
  const episodes = detail.indexOf('<SeriesEpisodeShowcase');
  const related = detail.indexOf('<RelatedTitlesSection');

  assert.ok(episodes >= 0, 'series episode showcase is missing from Detail');
  assert.ok(related >= 0, 'related titles are missing from Detail');
  assert.ok(episodes < related, 'related titles hide the episode list below the fold');
});

test('first publication timestamp keeps a newly completed series first', () => {
  assert.ok(app.includes("item.publishedAt || item.firstSeenAt"));
});
