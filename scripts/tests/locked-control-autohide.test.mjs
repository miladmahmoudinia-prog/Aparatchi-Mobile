import test from 'node:test';
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
