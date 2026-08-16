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
  'startupFallbackTimer = setTimeout(dismissStartup, 10000);',
  'startupDismissedRef.current = true;\n    setStartupVisible(false);',
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
if (!app.includes('const STARTUP_MIN_VISIBLE_MS = 5000;')) throw new Error('Startup must keep the requested five-second warm-up.');
if (!app.includes('const startupStartedAtRef = useRef(Date.now());')) throw new Error('Startup warm-up clock is missing.');
if (app.includes('startupFallbackTimer = setTimeout(dismissStartup, 15000);')) throw new Error('The old 15-second emergency fallback is still active.');
if (app.includes('startupFallbackTimer = setTimeout(dismissStartup, 1200);')) throw new Error('The old 1.2-second emergency fallback is still active.');

const dismissStart = app.indexOf('const dismissStartup = useCallback(() => {');
const dismissEnd = app.indexOf('\n  }, []);', dismissStart);
const dismissBlock = app.slice(dismissStart, dismissEnd);
if (dismissStart < 0 || dismissEnd < 0) throw new Error('Startup dismissal callback is missing.');
if (!dismissBlock.includes('setTimeout(')) throw new Error('Ready content must respect the five-second warm-up.');
if (!dismissBlock.includes('STARTUP_MIN_VISIBLE_MS')) throw new Error('Startup dismissal is not tied to the warm-up duration.');

console.log(JSON.stringify({
  startup: 'cinema-projectionist',
  minimumVisibleMs: 5000,
  emergencyFallbackMs: 10000,
  dismissesImmediatelyWhenContentReady: false,
}, null, 2));
