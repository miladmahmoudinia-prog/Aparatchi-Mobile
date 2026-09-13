import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const app = fs.readFileSync('App.tsx', 'utf8');
const source = app.slice(app.indexOf('const successfulArtworkUrls ='), app.indexOf('const PersonAvatar ='));
export function harness() {
  const slots = []; const timers = new Map(); let cursor = 0, seq = 0;
  const effects = [];
  const context = {
    useMemo: (fn, deps) => { const i = cursor++; const old = slots[i]; if (!old || deps.some((v,j) => v !== old.deps[j])) slots[i] = {deps, value: fn()}; return slots[i].value; },
    useState: (initial) => { const i = cursor++; if (!slots[i]) slots[i] = {value: initial}; return [slots[i].value, (fn) => { slots[i].value = fn(slots[i].value); }]; },
    useRef: (initial) => { const i = cursor++; return slots[i] ||= {current: initial}; },
    useEffect: (fn, deps) => { const i = cursor++; const old = slots[i]; if (!old || deps.some((v,j) => v !== old.deps[j])) { old?.cleanup?.(); effects.push(() => { slots[i] = {deps, cleanup: fn()}; }); } },
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, {fn, ms}); return id; },
    clearTimeout: id => timers.delete(id),
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(source+'\nglobalThis.hook = useArtworkSources;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  return {
    render: urls => { cursor = 0; const result = context.hook(urls); effects.splice(0).forEach(fn => fn()); return result; },
    tick: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(t => {assert.equal(t.ms,700); t.fn();}); },
  };
}
