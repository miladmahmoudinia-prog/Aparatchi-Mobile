import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const source = fs.readFileSync('App.tsx', 'utf8');
const escaped = String(pkg.version).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const visiblePattern = new RegExp(`const APP_DISPLAY_VERSION = ['\"]${escaped}['\"];`);

if (app?.expo?.version !== pkg.version) {
  throw new Error(`app.json version ${app?.expo?.version} does not match package ${pkg.version}`);
}
if (!visiblePattern.test(source)) {
  throw new Error(`Side-menu APP_DISPLAY_VERSION does not match package ${pkg.version}`);
}
if (!source.includes('نسخه {APP_DISPLAY_VERSION}')) {
  throw new Error('Side-menu version label is missing');
}

console.log(`Visible app version verified: ${pkg.version}`);
