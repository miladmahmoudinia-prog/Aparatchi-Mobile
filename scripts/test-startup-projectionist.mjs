import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const required = [
  'startupProjectionistScene',
  'startupCinemaScreenFrame',
  'startupProjectionBeam',
  'startupOperatorHead',
  'startupOperatorBody',
  'startupProjectorReelBack',
  'startupProjectorReelFront',
  'startupProjectorLensGlass',
  'چراغ‌ها خاموش می‌شوند؛ نمایش تا چند لحظه دیگر آغاز می‌شود',
  'آپاراتچی در حال آماده‌کردن حلقهٔ فیلم است…',
  'const reelSpin = motion.interpolate',
  'const beamOpacity = motion.interpolate',
  'const minimumVisibleMs = 10000;',
  'startupFallbackTimer = setTimeout(dismissStartup, 15000);',
];

for (const marker of required) {
  if (!app.includes(marker)) throw new Error(`Missing projectionist startup marker: ${marker}`);
}

const start = app.indexOf('function StartupScreen() {');
const end = app.indexOf('\nfunction ', start + 10);
const block = app.slice(start, end);
if (block.includes('در حال آماده‌کردن پرده نمایش')) throw new Error('Legacy startup copy is still present.');
if (block.includes('startupLogoMark')) throw new Error('Legacy spinning logo startup is still being rendered.');
if (!block.includes('reelHoleStyles[hole]')) throw new Error('Projector reel hole styles must use the type-safe style array.');
if (app.includes('const minimumVisibleMs = 850;')) throw new Error('Old 850ms startup minimum is still active.');
if (app.includes('startupFallbackTimer = setTimeout(dismissStartup, 1200);')) throw new Error('Old 1.2s emergency dismissal is still active.');

console.log(JSON.stringify({
  startup: 'cinema-projectionist',
  minimumVisibleMs: 10000,
  emergencyFallbackMs: 15000,
  waitsForNormalContentReadyDismissal: true,
}, null, 2));
