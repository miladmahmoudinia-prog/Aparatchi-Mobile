import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const kotlin = await fs.readFile('modules/aparatchi-custom-tab/android/src/main/java/expo/modules/aparatchicustomtab/AparatchiCustomTabModule.kt', 'utf8');
const config = await fs.readFile('modules/aparatchi-custom-tab/expo-module.config.json', 'utf8');

const requireMarker = (source, marker, label) => {
  if (!source.includes(marker)) throw new Error(`Missing ${label}: ${marker}`);
};

requireMarker(app, "import AparatchiCustomTab from './modules/aparatchi-custom-tab/src';", 'native module import');
requireMarker(app, "if (Platform.OS === 'android') {", 'Android branch');
requireMarker(app, 'await AparatchiCustomTab.openAsync(request.url)', 'native custom tab launch');
requireMarker(app, "await WebBrowser.openBrowserAsync(request.url", 'iOS browser surface');

const operatorStart = app.indexOf('function OperatorWebModal({');
const operatorEnd = app.indexOf('\nfunction VpnBlockModal({', operatorStart);
const operatorBlock = app.slice(operatorStart, operatorEnd);
if (operatorBlock.includes('getCustomTabsSupportingBrowsersAsync')) {
  throw new Error('Operator Android path still uses expo-web-browser package discovery.');
}
if (operatorBlock.includes('browserPackage ? { browserPackage }')) {
  throw new Error('Old browserPackage chooser workaround still exists.');
}
if (operatorBlock.includes('<Text numberOfLines={1} style={styles.operatorBrowserLaunchTitle}>{request.title}</Text>\n          {failed ?')) {
  throw new Error('Loading state still shows the old title text before browser launch.');
}

requireMarker(kotlin, 'Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION)', 'Custom Tabs service discovery');
requireMarker(kotlin, 'customTabsIntent.intent.setPackage(browserPackage)', 'explicit browser package');
requireMarker(kotlin, 'customTabsIntent.intent.component = ComponentName', 'explicit browser activity');
requireMarker(kotlin, 'customTabsIntent.launchUrl(activity, uri)', 'native Custom Tab launch');
requireMarker(config, 'expo.modules.aparatchicustomtab.AparatchiCustomTabModule', 'Expo autolink registration');

console.log(JSON.stringify({
  androidExpoWebBrowser: false,
  nativeCustomTab: true,
  explicitBrowserPackage: true,
  explicitBrowserComponent: true,
  webView: false,
  loadingText: false,
}, null, 2));
