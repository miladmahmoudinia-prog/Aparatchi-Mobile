import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const app = fs.readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
function harness() {
  let slots = [], cursor = 0, effects = [], timers = new Map(), serial = 0;
  const context = vm.createContext({
    useMemo: (fn) => fn(),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], fn => { slots[i] = typeof fn === 'function' ? fn(slots[i]) : fn; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= {current: initial}; },
    useEffect(fn, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((v, j) => v !== old.deps[j])) {
        old?.cleanup?.(); slots[i] = {deps}; effects.push(() => { slots[i].cleanup = fn(); });
      }
    },
    setTimeout(fn) { timers.set(++serial, fn); return serial; },
    clearTimeout(id) { timers.delete(id); },
  });
  const code = app.slice(app.indexOf('const successfulArtworkUrls ='), app.indexOf('const PersonAvatar ='));
  vm.runInContext(ts.transpileModule(code + '\nglobalThis.run = useArtworkSources;', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText, context);
  return {
    render(input) { cursor = 0; const result = context.run(input); effects.splice(0).forEach(fn => fn()); return result; },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
  };
}
test('artwork keeps slow primary alive, races at most two routes, and retains the successful one', () => {
  const h = harness(), urls = ['a','b','c'];
  assert.deepEqual([...h.render(urls).sources], ['a']);
  h.tick(); let r = h.render(urls);
  assert.deepEqual([...r.sources], ['a','b']);
  r.finish('b', true); r.finish('a', false);
  assert.deepEqual([...h.render(urls).sources], ['b']);
});
test('artwork advances failed routes and ignores callbacks from a recycled card', () => {
  const h = harness(); let old = h.render(['a','b']);
  old.finish('a', false);
  assert.deepEqual([...h.render(['a','b']).sources], ['b']);
  h.render(['x','y']); old.finish('b', true);
  let current = h.render(['x','y']);
  assert.deepEqual([...current.sources], ['x']);
  current.finish('x', false); current = h.render(['x','y']);
  current.finish('y', false);
  assert.equal(h.render(['x','y']).sources.length, 0);
});
