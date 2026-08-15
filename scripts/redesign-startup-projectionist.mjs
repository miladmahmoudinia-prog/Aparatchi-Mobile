import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

// Keep the already-approved projectionist artwork. Startup must disappear as
// soon as the first usable Home content is applied; there is no cosmetic
// minimum-duration gate. The fallback only prevents a failed load from
// trapping the user behind the splash forever.
if (!source.includes('startupProjectionistScene')) {
  throw new Error('Projectionist startup scene is missing; refusing to replace the approved artwork.');
}

const delayedDismiss = `  const dismissStartup = useCallback(() => {\n    if (startupDismissedRef.current) return;\n    startupDismissedRef.current = true;\n    const minimumVisibleMs = 10000;\n    const elapsed = Date.now() - startupStartedAtRef.current;\n    const delay = Math.max(0, minimumVisibleMs - elapsed);\n    startupDismissTimerRef.current = setTimeout(() => setStartupVisible(false), delay);\n  }, []);`;

const immediateDismiss = `  const dismissStartup = useCallback(() => {\n    if (startupDismissedRef.current) return;\n    startupDismissedRef.current = true;\n    setStartupVisible(false);\n  }, []);`;

if (source.includes(delayedDismiss)) {
  source = source.replace(delayedDismiss, immediateDismiss);
} else if (!source.includes(immediateDismiss)) {
  throw new Error('Could not locate the startup dismissal block safely.');
}

source = source.replace('  const startupStartedAtRef = useRef(Date.now());\n', '');
source = source.replace('startupFallbackTimer = setTimeout(dismissStartup, 15000);', 'startupFallbackTimer = setTimeout(dismissStartup, 5000);');
source = source.replace('startupFallbackTimer = setTimeout(dismissStartup, 1200);', 'startupFallbackTimer = setTimeout(dismissStartup, 5000);');

if (source.includes('minimumVisibleMs')) {
  throw new Error('A forced minimum startup duration is still present.');
}
if (source.includes('startupStartedAtRef')) {
  throw new Error('The obsolete startup timing ref is still present.');
}
if (!source.includes(immediateDismiss)) {
  throw new Error('Startup is not dismissed immediately when content becomes usable.');
}
if (!source.includes('startupFallbackTimer = setTimeout(dismissStartup, 5000);')) {
  throw new Error('Could not set the non-blocking 5-second emergency fallback.');
}

await fs.writeFile(path, source, 'utf8');
console.log('Projectionist startup now dismisses immediately on usable content, with a 5-second emergency fallback.');
