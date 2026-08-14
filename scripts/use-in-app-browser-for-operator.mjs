import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (oldText, newText, label) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
};

if (
  source.includes('getCustomTabsSupportingBrowsersAsync') &&
  !source.includes('در حال باز کردن پخش ویژه همراه در پنجره امن آپاراتچی') &&
  !source.includes('پخش در مرورگر درون‌برنامه‌ای باز می‌شود')
) {
  console.log('Operator custom-tab chooser fix already applied.');
  process.exit(0);
}

if (!source.includes('  Platform,\n')) {
  replaceOnce(
    `  PanResponder,\n  Pressable,`,
    `  PanResponder,\n  Platform,\n  Pressable,`,
    'Platform import',
  );
}

source = source.replace(`  const [launching, setLaunching] = useState(true);\n`, '');
source = source.replace(`    setLaunching(true);\n`, '');
source = source.replace(`        setLaunching(false);\n`, '');

replaceOnce(
`        const result = await WebBrowser.openBrowserAsync(request.url, {\n          toolbarColor: '#090B10',`,
`        let browserPackage: string | undefined;\n        if (Platform.OS === 'android') {\n          const support = await WebBrowser.getCustomTabsSupportingBrowsersAsync();\n          browserPackage = support.preferredBrowserPackage\n            || support.defaultBrowserPackage\n            || support.browserPackages.find((packageName) => packageName === 'com.android.chrome')\n            || support.browserPackages.find((packageName) => /chrome/i.test(packageName))\n            || support.browserPackages[0];\n          if (browserPackage) {\n            await WebBrowser.warmUpAsync(browserPackage).catch(() => undefined);\n            await WebBrowser.mayInitWithUrlAsync(request.url, browserPackage).catch(() => undefined);\n          }\n        }\n\n        const result = await WebBrowser.openBrowserAsync(request.url, {\n          ...(browserPackage ? { browserPackage } : {}),\n          toolbarColor: '#090B10',`,
  'pinned custom-tab browser',
);

replaceOnce(
`          ) : (\n            <>\n              <ActivityIndicator color={COLORS.gold} size="large" />\n              <Text style={styles.operatorBrowserLaunchText}>\n                {launching ? 'در حال باز کردن پخش ویژه همراه در پنجره امن آپاراتچی…' : 'در حال آماده‌سازی پخش…'}\n              </Text>\n              <Text style={styles.operatorBrowserLaunchHint}>\n                پخش در مرورگر درون‌برنامه‌ای باز می‌شود و با بستن آن مستقیم به همین صفحه برمی‌گردید.\n              </Text>\n            </>\n          )}`,
`          ) : (\n            <ActivityIndicator color={COLORS.gold} size="large" />\n          )}`,
  'operator loading copy',
);

await fs.writeFile(path, source, 'utf8');
console.log('Operator playback now pins a Custom Tabs browser and keeps the launch sheet text-free.');
