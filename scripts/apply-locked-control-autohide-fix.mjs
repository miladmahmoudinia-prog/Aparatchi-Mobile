import fs from 'node:fs/promises';

const appPath = 'App.tsx';
let source = await fs.readFile(appPath, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing patch target: ${label}`);
  source = source.replace(before, after);
}

replaceOnce(
`  const scheduleControlsHide = useCallback(() => {\n    clearControlsTimer();\n    if (!firstFrameReady || settingsOpen || episodesOpen || controlsLocked) return;\n    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);\n  }, [clearControlsTimer, controlsLocked, episodesOpen, firstFrameReady, settingsOpen]);`,
`  const scheduleControlsHide = useCallback(() => {\n    clearControlsTimer();\n    if (!firstFrameReady || settingsOpen || episodesOpen) return;\n    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3200);\n  }, [clearControlsTimer, episodesOpen, firstFrameReady, settingsOpen]);`,
  'locked controls share the normal hide timer',
);

replaceOnce(
`  const unlockPlayerControls = () => {\n    setControlsLocked(false);\n    setControlsVisible(true);\n  };`,
`  const unlockPlayerControls = () => {\n    setControlsLocked(false);\n    revealControls();\n  };`,
  'unlock resumes normal auto-hide',
);

replaceOnce(
`  const toggleSurfaceControls = () => {\n    if (controlsLocked) return;\n    if (controlsVisible) hideControls();\n    else revealControls();\n  };`,
`  const toggleSurfaceControls = () => {\n    if (controlsLocked) {\n      if (controlsVisible) hideControls();\n      else revealControls();\n      return;\n    }\n    if (controlsVisible) hideControls();\n    else revealControls();\n  };`,
  'locked surface tap toggles unlock affordance',
);

replaceOnce(
`        {controlsLocked ? (\n          <Pressable`,
`        {controlsLocked && controlsVisible ? (\n          <Pressable`,
  'unlock button only appears with visible controls',
);

replaceOnce(
`    if (controlsLocked) {\n      setControlsLocked(false);\n      setControlsVisible(true);\n      return;\n    }`,
`    if (controlsLocked) {\n      setControlsLocked(false);\n      revealControls();\n      return;\n    }`,
  'back unlock also resumes auto-hide',
);

await fs.writeFile(appPath, source, 'utf8');

const testPath = 'scripts/tests/locked-control-autohide.test.mjs';
const testSource = `import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');

test('locked player uses the same controls hide timer', () => {
  const start = source.indexOf('const scheduleControlsHide');
  const end = source.indexOf('const revealControls', start);
  const block = source.slice(start, end);
  assert.ok(!block.includes('controlsLocked) return'));
  assert.ok(block.includes('setControlsVisible(false), 3200'));
});

test('video taps reveal and hide the unlock affordance while locked', () => {
  const start = source.indexOf('const toggleSurfaceControls');
  const end = source.indexOf('const progress =', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('if (controlsLocked)'));
  assert.ok(block.includes('if (controlsVisible) hideControls()'));
  assert.ok(block.includes('else revealControls()'));
});

test('unlock button renders only while locked controls are visible', () => {
  const labelIndex = source.indexOf('accessibilityLabel="باز کردن قفل کنترل‌ها"');
  assert.ok(labelIndex > 0);
  const block = source.slice(Math.max(0, labelIndex - 300), labelIndex + 120);
  assert.ok(block.includes('{controlsLocked && controlsVisible ? ('));
});

test('unlocking resumes normal control auto-hide', () => {
  const start = source.indexOf('const unlockPlayerControls');
  const end = source.indexOf('const switchQuality', start);
  const block = source.slice(start, end);
  assert.ok(block.includes('setControlsLocked(false)'));
  assert.ok(block.includes('revealControls()'));
});
`;
await fs.mkdir('scripts/tests', { recursive: true });
await fs.writeFile(testPath, testSource, 'utf8');

const appJsonPath = 'app.json';
const appJson = JSON.parse(await fs.readFile(appJsonPath, 'utf8'));
if (appJson?.expo?.version === '0.15.7') appJson.expo.version = '0.15.8';
if (Number(appJson?.expo?.android?.versionCode || 0) < 28) appJson.expo.android.versionCode = 28;
await fs.writeFile(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`, 'utf8');

const packagePath = 'package.json';
const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
if (pkg.version === '0.15.7') pkg.version = '0.15.8';
await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log('Applied locked player control auto-hide fix.');
