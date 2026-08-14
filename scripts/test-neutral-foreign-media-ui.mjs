import fs from 'node:fs/promises';

const source = await fs.readFile('App.tsx', 'utf8');

const playableStart = source.indexOf('const playableVersionsFor = (');
const playableEnd = source.indexOf('const languageSectionsForFiles = (', playableStart);
const playable = source.slice(playableStart, playableEnd);
if (!playable.includes('const unlabeledSources = playbackSourcesForFiles(files.filter((file) => !file.language));')) {
  throw new Error('Unlabelled foreign playback is still restricted or hidden.');
}
if (!playable.includes("label: 'پخش آنلاین'")) throw new Error('Neutral playback label is missing.');
if (/unlabeledSources\s*=\s*isIranianItem/.test(playable)) throw new Error('Neutral playback is still Iranian-only.');

const downloadsStart = source.indexOf('const languageSectionsForFiles = (');
const downloadsEnd = source.indexOf('const isEpisodeSection', downloadsStart);
const downloads = source.slice(downloadsStart, downloadsEnd);
if (!downloads.includes('const plainFiles = sortedDownloadFiles(reconciled.filter((file) => !file.language));')) {
  throw new Error('Unlabelled foreign downloads are still hidden.');
}
if (!downloads.includes("title: 'لینک‌های دریافت'")) throw new Error('Neutral download heading is missing.');
if (downloads.includes("badge: 'دریافت'")) throw new Error('Neutral group should not create a language-like poster/sheet badge.');

const badgesStart = source.indexOf('const itemPosterBadges = (');
const badgesEnd = source.indexOf('const COUNTRY_LABELS_FA', badgesStart);
const badges = source.slice(badgesStart, badgesEnd);
if (!badges.includes("languages.includes('dubbed')")) throw new Error('Dubbed badge logic disappeared.');
if (!badges.includes("languages.includes('subtitled')")) throw new Error('Subtitle badge logic disappeared.');
if (badges.includes('plain') || badges.includes('دریافت')) throw new Error('Neutral media leaked into poster language badges.');

console.log(JSON.stringify({
  foreignUnlabelledPlayback: 'visible-neutral',
  foreignUnlabelledDownloads: 'visible-neutral',
  fakeDubSubtitleBadge: false,
}, null, 2));
