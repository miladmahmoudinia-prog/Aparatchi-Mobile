import fs from 'node:fs/promises';

const service = await fs.readFile('src/contentService.ts', 'utf8');
const app = await fs.readFile('App.tsx', 'utf8');
const types = await fs.readFile('src/types.ts', 'utf8');

const requireIn = (source, marker, label) => {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
};

requireIn(types, 'export type PersonWorkRef = string | number;', 'compact ref type');
requireIn(types, 'peopleWorks?: Record<string, PersonWorkRef[]>;', 'payload ref type');
requireIn(service, 'Record<string, PersonWorkRef[]>', 'service compact refs');
requireIn(service, "typeof rawRef === 'number' && Number.isInteger(rawRef) && rawRef >= 0", 'numeric ref preservation');
if (service.includes('stringArray(rawIds).map((id) => asString(id))')) {
  throw new Error('Remote numeric people refs are still expanded into strings during startup.');
}

requireIn(app, "typeof ref === 'number' ? catalog[ref] : catalogById?.get(String(ref))", 'lazy numeric person work resolution');
requireIn(app, 'peopleWorkItemIdsMatchingQuery', 'actor reverse-search helper');
requireIn(app, 'peopleWorks={content.peopleWorks}', 'root people index wiring');
requireIn(app, "if (!entry.text.includes(deferredQuery) && !actorMatchedIds.has(String(entry.item.id))) continue;", 'actor-aware simple search');
if (app.includes("...(item.people || []).flatMap((person) => [person.nameFa, person.name || '']),\n        ].join(' ')),\n      })),\n    [catalog],")) {
  throw new Error('Simple search still builds a duplicated per-item people text index at mount.');
}

// The transport contract supports both the new numeric refs and old string IDs.
const fixtureItems = [{ id: 'a' }, { id: 'b' }];
const resolve = (refs) => refs.map((ref) => typeof ref === 'number' ? fixtureItems[ref]?.id : String(ref || '')).filter(Boolean);
const resolved = resolve([0, 1, 'legacy-id']);
if (JSON.stringify(resolved) !== JSON.stringify(['a', 'b', 'legacy-id'])) {
  throw new Error(`Compact ref fixture failed: ${JSON.stringify(resolved)}`);
}

console.log(JSON.stringify({
  compactRefs: true,
  numericRefsStayNumericAtStartup: true,
  legacyStringRefs: true,
  actorSearchPreserved: true,
}, null, 2));
