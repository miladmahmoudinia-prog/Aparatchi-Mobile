import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');
const write = (path, value) => fs.writeFile(path, value, 'utf8');

let source = await read('App.tsx');
const before = `if (exactGeneratedFrame && isSafeHttpUrl(artwork) && !isPlaceholderUrl(artwork)) return artwork;`;
const after = `if (exactGeneratedFrame) return artwork;`;
if (!source.includes(before)) {
  if (!source.includes(after)) throw new Error('Exact episode artwork helper target not found.');
} else {
  source = source.replace(before, after);
  await write('App.tsx', source);
}

const pkg = JSON.parse(await read('package.json'));
pkg.version = '0.15.1';
await write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const app = JSON.parse(await read('app.json'));
app.expo.version = '0.15.1';
app.expo.android.versionCode = 21;
await write('app.json', `${JSON.stringify(app, null, 2)}\n`);

const lock = JSON.parse(await read('package-lock.json'));
lock.version = '0.15.1';
if (lock.packages?.['']) lock.packages[''].version = '0.15.1';
await write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);

console.log('Exact local episode artwork hotfix applied; Android v0.15.1 (21).');
