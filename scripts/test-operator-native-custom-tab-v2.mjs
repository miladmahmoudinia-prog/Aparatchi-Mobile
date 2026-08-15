import fs from 'node:fs/promises';

const app = await fs.readFile('App.tsx', 'utf8');
const kotlin = await fs.readFile('modules/aparatchi-custom-tab/android/src/main/java/expo/modules/aparatchicustomtab/AparatchiCustomTabModule.kt', 'utf8');
const manifest = await fs.readFile('modules/aparatchi-custom-tab/android/src/main/AndroidManifest.xml', 'utf8');
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

requireMarker(kotlin, 'CustomTabsClient.getPackageName(', 'AndroidX Custom Tabs browser selection');
requireMarker(kotlin, 'CustomTabsClient.bindCustomTabsServicePreservePriority(', 'bound Custom Tabs service');
requireMarker(kotlin, 'client.warmup(0L)', 'browser warmup');
requireMarker(kotlin, 'client.newSession(null)', 'real Custom Tabs session');
requireMarker(kotlin, '.setSession(session)', 'session-pinned Custom Tabs intent');
requireMarker(kotlin, '.setSendToExternalDefaultHandlerEnabled(false)', 'redirect containment');
requireMarker(kotlin, 'customTabsIntent.intent.setPackage(browserPackage)', 'selected browser package');
requireMarker(kotlin, 'customTabsIntent.launchUrl(activity, uri)', 'native Custom Tab launch');
requireMarker(kotlin, '"sessionBound" to true', 'session-bound launch result');

if (kotlin.includes('customTabsIntent.intent.component = ComponentName')) {
  throw new Error('Old explicit-activity workaround remains; session binding must own component routing.');
}
if (kotlin.includes('.setSendToExternalDefaultHandlerEnabled(true)')) {
  throw new Error('Operator redirect chain is allowed to escape to an external app.');
}

requireMarker(manifest, '<queries>', 'Android package visibility queries');
requireMarker(manifest, 'android.support.customtabs.action.CustomTabsService', 'Custom Tabs service visibility');
requireMarker(config, 'expo.modules.aparatchicustomtab.AparatchiCustomTabModule', 'Expo autolink registration');

console.log(JSON.stringify({
  androidExpoWebBrowser: false,
  nativeCustomTab: true,
  customTabsServiceBound: true,
  realSession: true,
  sessionPinsBrowserComponent: true,
  externalRedirectHandlerDisabled: true,
  packageVisibilityDeclared: true,
  webView: false,
  loadingText: false,
}, null, 2));
