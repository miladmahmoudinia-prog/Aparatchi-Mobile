import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const required = [
  "const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(15);",
  "const nextEpisodeGroup = activeEpisodeIndex >= 0",
  "playerEpisodeGroups[activeEpisodeIndex + 1] || null",
  "item?.type === 'series' &&",
  "nextEpisodeGroup &&",
  "currentTime >= movieEndOverlayStart",
  "setNextEpisodeCountdown((value) => Math.max(0, value - 1));",
  "if (nextEpisodeCountdown <= 0)",
  "onEpisodeSelect(nextEpisodeGroup, request.language);",
  "قسمت بعدی",
  "بستن پیشنهاد قسمت بعد",
  "پخش ({toPersianDigits(nextEpisodeCountdown)})",
  "style={[styles.nextEpisodeOverlay, frameRect]}",
  "nextEpisodeOverlay: { position: 'absolute'",
];

for (const marker of required) {
  if (!app.includes(marker)) throw new Error(`Missing series-next marker: ${marker}`);
}

if (!app.includes("duration - 120")) throw new Error('Two-minute fallback is missing.');
if (!app.includes('endCreditsStartSeconds')) throw new Error('Credits metadata hook is missing.');
const styleStart = app.indexOf('nextEpisodeOverlay: {');
const styleEnd = app.indexOf('nextEpisodeCard:', styleStart);
const overlayStyle = app.slice(styleStart, styleEnd);
if (overlayStyle.includes('absoluteFillObject')) throw new Error('Next episode overlay still fills the entire phone screen.');

console.log(JSON.stringify({
  overlay: 'series-next-episode',
  placement: 'video-frame',
  requiresRealNextEpisode: true,
  countdownSeconds: 15,
  autoPlay: true,
  currentPlaybackContinuesUntilSwitch: true,
  fallbackSecondsBeforeEnd: 120,
}, null, 2));
