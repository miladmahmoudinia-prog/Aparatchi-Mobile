import fs from 'node:fs/promises';

const [app, nativeModule] = await Promise.all([
  fs.readFile('App.tsx', 'utf8'),
  fs.readFile('modules/aparatchi-custom-tab/android/src/main/java/expo/modules/aparatchicustomtab/AparatchiCustomTabModule.kt', 'utf8'),
]);

const operatorStart = app.indexOf('function OperatorWebModal({');
const operatorEnd = app.indexOf('function VpnBlockModal({', operatorStart);
if (operatorStart < 0 || operatorEnd <= operatorStart) throw new Error('OperatorWebModal block not found.');
const operatorBlock = app.slice(operatorStart, operatorEnd);

for (const marker of [
  "import AparatchiCustomTab from './modules/aparatchi-custom-tab/src';",
  "if (Platform.OS === 'android')",
  'AparatchiCustomTab.openAsync(request.url)',
  "if (!result?.opened) throw new Error('Native Custom Tab did not open.');",
]) {
  if (!app.includes(marker)) throw new Error(`Missing native operator-browser marker: ${marker}`);
}

if (operatorBlock.includes('<WebView')) {
  throw new Error('Operator playback must not render inside WebView because provider blocks embedded playback.');
}
if (operatorBlock.includes('Linking.openURL')) {
  throw new Error('Android operator playback must not eject through a generic external browser intent.');
}

for (const marker of [
  'CustomTabsClient.getPackageName(',
  '.setSession(session)',
  'setPackage(browserPackage)',
  'launchIntent.component = ComponentName(',
  '.setSendToExternalDefaultHandlerEnabled(false)',
  'bindCustomTabsServicePreservePriority(',
  '"explicitComponent" to true',
  '"sessionBound" to true',
]) {
  if (!nativeModule.includes(marker)) throw new Error(`Missing pinned native Custom Tab marker: ${marker}`);
}

for (const unwanted of [
  'در حال باز کردن پخش ویژه همراه در پنجره امن آپاراتچی',
  'پخش در مرورگر درون‌برنامه‌ای باز می‌شود',
]) {
  if (operatorBlock.includes(unwanted)) throw new Error(`Operator loading sheet still contains unwanted copy: ${unwanted}`);
}

console.log(JSON.stringify({
  providerWebViewBlocked: true,
  androidBrowserMode: 'native-session-bound-explicit-custom-tab',
  genericChooserFallback: false,
  explicitBrowserComponent: true,
  loadingCopyRemoved: true,
}, null, 2));
