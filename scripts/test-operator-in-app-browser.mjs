import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const required = [
  "import * as WebBrowser from 'expo-web-browser';",
  'getCustomTabsSupportingBrowsersAsync',
  'preferredBrowserPackage',
  "packageName === 'com.android.chrome'",
  'WebBrowser.openBrowserAsync(request.url',
  '...(browserPackage ? { browserPackage } : {})',
  "toolbarColor: '#090B10'",
  'showTitle: false',
  'createTask: false',
  'showInRecents: false',
  "dismissButtonStyle: 'close'",
];
for (const marker of required) {
  if (!app.includes(marker)) throw new Error(`Missing operator-browser marker: ${marker}`);
}

const operatorStart = app.indexOf('function OperatorWebModal({');
const operatorEnd = app.indexOf('function VpnBlockModal({', operatorStart);
const operatorBlock = app.slice(operatorStart, operatorEnd);
if (operatorBlock.includes('<WebView')) {
  throw new Error('Operator playback must not render inside WebView because provider blocks embedded playback.');
}
if (operatorBlock.includes('Linking.openURL')) {
  throw new Error('Operator playback must use a Custom Tab instead of ejecting to a normal external browser intent.');
}
for (const unwanted of [
  'در حال باز کردن پخش ویژه همراه در پنجره امن آپاراتچی',
  'پخش در مرورگر درون‌برنامه‌ای باز می‌شود',
]) {
  if (operatorBlock.includes(unwanted)) throw new Error(`Operator loading sheet still contains unwanted copy: ${unwanted}`);
}

console.log(JSON.stringify({
  providerWebViewBlocked: true,
  browserMode: 'pinned-in-app-custom-tab',
  browserChooserAvoided: true,
  createTask: false,
  loadingCopyRemoved: true,
}, null, 2));
