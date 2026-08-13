import fs from 'node:fs/promises';

const file = 'App.tsx';
let source = await fs.readFile(file, 'utf8');

const start = source.indexOf('function OperatorWebModal(');
const end = source.indexOf('\nfunction VpnBlockModal(', start);
if (start < 0 || end < 0) throw new Error('OperatorWebModal block not found');
let block = source.slice(start, end);

const oldHttpError = `              onHttpError={() => {\n                setLoading(false);\n                setFailed(true);\n              }}\n`;
if (!block.includes(oldHttpError)) {
  if (block.includes('onHttpError=')) throw new Error('OperatorWebModal onHttpError shape changed; refusing unsafe patch');
} else {
  block = block.replace(oldHttpError, `              // Do not fail the whole operator page for HTTP errors from images,\n              // scripts or other provider subresources. Actual WebView/network load\n              // failures are still handled by onError below.\n`);
}

if (!block.includes('onError={() => {')) {
  throw new Error('OperatorWebModal lost the main WebView onError handler');
}
if (block.includes('onHttpError=')) {
  throw new Error('OperatorWebModal still has a fatal onHttpError handler');
}

source = source.slice(0, start) + block + source.slice(end);
await fs.writeFile(file, source, 'utf8');

const verified = await fs.readFile(file, 'utf8');
const verifiedStart = verified.indexOf('function OperatorWebModal(');
const verifiedEnd = verified.indexOf('\nfunction VpnBlockModal(', verifiedStart);
const verifiedBlock = verified.slice(verifiedStart, verifiedEnd);
if (verifiedBlock.includes('onHttpError=')) throw new Error('fatal provider subresource handler remains');
if (!verifiedBlock.includes('onError={() => {')) throw new Error('main WebView failure handler missing after patch');
if (!verifiedBlock.includes('source={{ uri: request.url }}')) throw new Error('operator request URL wiring changed unexpectedly');

console.log('Sequential user fix #1 verified: provider subresource HTTP errors no longer replace operator playback with a false fatal screen.');
