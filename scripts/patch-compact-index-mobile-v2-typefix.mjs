import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');
const from = 'peopleWorks: Record<string, string[]>;';
const count = source.split(from).length - 1;
if (count < 1) throw new Error('Expected at least one remaining legacy peopleWorks prop type.');
source = source.split(from).join('peopleWorks: Record<string, PersonWorkRef[]>;');
await fs.writeFile(path, source);
console.log(JSON.stringify({ legacyPeopleWorksPropTypesUpdated: count }, null, 2));
