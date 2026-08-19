import fs from 'node:fs';
const path = 'scripts/apply-related-shortfilm-v38.mjs';
let source = fs.readFileSync(path, 'utf8');
const before = 'relatedStableHash(\\`${item.id}:\\${candidate.id}:\\${selectionSeed}\\`)';
const after = "relatedStableHash(String(item.id) + ':' + String(candidate.id) + ':' + String(selectionSeed))";
if (!source.includes(before) && !source.includes(after)) throw new Error('related hash generator anchor missing');
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Fixed related v38 generator interpolation');