import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

if (!source.includes('startupProjectionistScene')) {
  throw new Error('Projectionist startup must be applied before the type-safety fix.');
}

if (!source.includes('const reelHoleStyles = [')) {
  source = source.replace(
    `  const reelHoles = [0, 1, 2, 3];`,
    `  const reelHoles = [0, 1, 2, 3];\n  const reelHoleStyles = [\n    styles.startupReelHole0,\n    styles.startupReelHole1,\n    styles.startupReelHole2,\n    styles.startupReelHole3,\n  ];`,
  );
}

source = source.replaceAll(
  `styles[\`startupReelHole\${hole}\`]`,
  `reelHoleStyles[hole]`,
);

await fs.writeFile(path, source, 'utf8');
console.log('Startup reel styles are type-safe.');
