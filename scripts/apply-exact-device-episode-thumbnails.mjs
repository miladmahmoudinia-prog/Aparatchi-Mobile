import fs from 'node:fs/promises';

const file = 'App.tsx';
let source = await fs.readFile(file, 'utf8');

function replaceOnce(before, after, label) {
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one patch target, found ${count}`);
  source = source.replace(before, after);
}

// Sequential user fix #1: operator-only playback.
// Keep the provider WebView mounted while loading state changes. Reload it only
// when the user explicitly presses Retry.
replaceOnce(
  "  const [errorText, setErrorText] = useState('');\n",
  "  const [errorText, setErrorText] = useState('');\n  const [reloadNonce, setReloadNonce] = useState(0);\n",
  'operator WebView retry nonce',
);

replaceOnce(
  "            <Pressable onPress={() => { setStatus('loading'); setErrorText(''); }} style={styles.operatorWebRetry}>",
  "            <Pressable onPress={() => { setStatus('loading'); setErrorText(''); setReloadNonce((value) => value + 1); }} style={styles.operatorWebRetry}>",
  'operator WebView explicit retry',
);

replaceOnce(
  '          key={`${request.item.id}-${request.file.url}-${status}`}\n',
  '          key={`${request.item.id}-${request.file.url}-${reloadNonce}`}\n',
  'stable operator WebView key',
);

replaceOnce(
  "          onLoadEnd={() => setStatus('ready')}\n",
  "          onLoad={() => setStatus('ready')}\n",
  'operator WebView success-only ready state',
);

await fs.writeFile(file, source, 'utf8');

const verified = await fs.readFile(file, 'utf8');
if (verified.includes('key={`${request.item.id}-${request.file.url}-${status}`}')) {
  throw new Error('operator WebView still remounts when status changes');
}
if (!verified.includes('key={`${request.item.id}-${request.file.url}-${reloadNonce}`}')) {
  throw new Error('stable operator WebView key was not applied');
}
if (!verified.includes('setReloadNonce((value) => value + 1)')) {
  throw new Error('explicit operator WebView retry was not applied');
}
if (!verified.includes("onLoad={() => setStatus('ready')}")) {
  throw new Error('success-only WebView ready state was not applied');
}

console.log('Sequential user fix #1 verified: operator playback WebView no longer reloads on status changes.');
