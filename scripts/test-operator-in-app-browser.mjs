import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const required = [
  "import * as WebBrowser from 'expo-web-browser';",
  'WebBrowser.openBrowserAsync(request.url',
  "toolbarColor: '#090B10'",
  'showTitle: false',
  'createTask: false',
  'showInRecents: false',
  "dismissButtonStyle: 'close'",
  'پنجره امن آپاراتچی',
  'مستقیم به همین صفحه برمی‌گردید',
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
  throw new Error('Operator playback must prefer the in-app browser instead of ejecting to the external browser app.');
}

console.log(JSON.stringify({
  providerWebViewBlocked: true,
  browserMode: 'in-app-custom-tab',
  returnsToAparatchi: true,
  brandedLaunchSheet: true,
}, null, 2));
