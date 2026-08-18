import fs from 'node:fs/promises';

const file = 'App.tsx';
let source = await fs.readFile(file, 'utf8');

const startMarker = "      if (initialLoad && online && firstContent.source !== 'remote') {\n";
const endMarker = '      const firstApplied = applyContent(firstContent);\n';
const start = source.indexOf(startMarker);
if (start < 0) throw new Error('cold-start branch start marker not found');
const end = source.indexOf(endMarker, start);
if (end < 0) throw new Error('cold-start branch end marker not found');

const replacement = [
  "      if (initialLoad && online && firstContent.source !== 'remote') {",
  '        // Fetch the small current Home snapshot first. Starting the 18+ MB full',
  '        // index at the same time used to steal bandwidth from bootstrap and kept',
  '        // the branded loading screen visible for 10-20 seconds on real phones.',
  '        let bootstrapApplied = false;',
  '        try {',
  '          const bootstrapContent = await loadBootstrapContent();',
  '          if (bootstrapContent?.items.length) {',
  '            startupFallbackContentRef.current = bootstrapContent;',
  '            bootstrapApplied = Boolean(applyContent(bootstrapContent));',
  '          }',
  '        } catch {',
  '          // The complete index remains the network fallback below.',
  '        }',
  '',
  '        if (bootstrapApplied) {',
  '          dismissStartup();',
  '          // Bootstrap transport is finished before the large index begins, so',
  '          // Home truth wins the first-paint bandwidth race. Full navigation and',
  '          // search data then replace/enrich it silently in the background.',
  '          setTimeout(() => {',
  '            void loadContent(false)',
  '              .then((freshContent) => {',
  "                if (freshContent.source !== 'local') applyBackgroundFullContent(freshContent);",
  '              })',
  '              .catch(() => undefined);',
  '          }, 350);',
  '          return;',
  '        }',
  '',
  '        // If the small Home snapshot is unavailable, try the full index once.',
  '        // The independent startup escape timer below still prevents a broken',
  '        // network from trapping the user behind the loading screen.',
  '        try {',
  '          const freshContent = await loadContent(false);',
  "          if (freshContent.source === 'remote' && applyContent(freshContent)) {",
  '            dismissStartup();',
  '            return;',
  '          }',
  '        } catch {',
  '          // Fall through to the persisted emergency fallback below.',
  '        }',
  '        if (applyContent(firstContent)) dismissStartup();',
  '        return;',
  '      }',
  '',
].join('\n');

source = source.slice(0, start) + replacement + source.slice(end);

const timerStart = source.indexOf('    startupFallbackTimer = setTimeout(() => {');
if (timerStart < 0) throw new Error('startup fallback timer marker not found');
const oldTimerEnd = '    }, 10000);';
const timerEnd = source.indexOf(oldTimerEnd, timerStart);
if (timerEnd < 0) throw new Error('10-second startup fallback was not found');
source = source.slice(0, timerEnd) + '    }, 5600);' + source.slice(timerEnd + oldTimerEnd.length);
source = source.replace(
  '    // this ten-second timer is only an emergency escape for a broken network stack.',
  '    // this 5.6-second timer is only an emergency escape for a broken network stack.',
);

await fs.writeFile(file, source, 'utf8');
console.log('Patched cold-start freshness and bounded startup cover.');
