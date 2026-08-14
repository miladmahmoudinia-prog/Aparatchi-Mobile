import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (oldText, newText, label) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
};

if (source.includes('operatorBrowserAttempt')) {
  console.log('Operator in-app browser patch already applied.');
  process.exit(0);
}

replaceOnce(
  `import { WebView } from 'react-native-webview';`,
  `import * as WebBrowser from 'expo-web-browser';`,
  'web browser import',
);

const start = source.indexOf('function OperatorWebModal({');
const end = source.indexOf('\nfunction VpnBlockModal({', start);
if (start < 0 || end < 0) throw new Error('OperatorWebModal block not found');

const replacement = `function OperatorWebModal({\n  request,\n  onClose,\n}: {\n  request: OperatorWebRequest;\n  onClose: () => void;\n}) {\n  const [operatorBrowserAttempt, setOperatorBrowserAttempt] = useState(0);\n  const [failed, setFailed] = useState(false);\n  const [launching, setLaunching] = useState(true);\n  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);\n\n  useEffect(() => {\n    let cancelled = false;\n    setFailed(false);\n    setLaunching(true);\n\n    const openOperatorBrowser = async () => {\n      try {\n        // Upera blocks embedded WebViews. expo-web-browser keeps Aparatchi as the\n        // owning app while using Android Chrome Custom Tabs / iOS SafariViewController,\n        // which satisfies the provider's real-browser requirement.\n        const result = await WebBrowser.openBrowserAsync(request.url, {\n          toolbarColor: '#090B10',\n          secondaryToolbarColor: '#11151C',\n          controlsColor: COLORS.gold,\n          showTitle: false,\n          enableBarCollapsing: true,\n          enableDefaultShareMenuItem: false,\n          createTask: false,\n          showInRecents: false,\n          dismissButtonStyle: 'close',\n        });\n        if (cancelled) return;\n\n        // Android resolves with \"opened\" as soon as the Custom Tab is on top.\n        // Remove the launch sheet underneath it so closing the tab returns directly\n        // to the same Aparatchi detail screen. iOS resolves after the sheet closes.\n        if (result.type === 'opened') {\n          closeTimerRef.current = setTimeout(onClose, 250);\n          return;\n        }\n        onClose();\n      } catch {\n        if (cancelled) return;\n        setLaunching(false);\n        setFailed(true);\n      }\n    };\n\n    void openOperatorBrowser();\n    return () => {\n      cancelled = true;\n      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);\n    };\n  }, [request.url, operatorBrowserAttempt]);\n\n  return (\n    <Modal visible transparent animationType=\"fade\" onRequestClose={onClose}>\n      <View style={styles.operatorBrowserLaunchOverlay}>\n        <View style={styles.operatorBrowserLaunchCard}>\n          <View style={styles.operatorBrowserBrandIcon}>\n            <Ionicons name=\"film-outline\" color={COLORS.gold} size={26} />\n          </View>\n          <Text numberOfLines={1} style={styles.operatorBrowserLaunchTitle}>{request.title}</Text>\n          {failed ? (\n            <>\n              <Text style={styles.operatorBrowserLaunchText}>\n                پنجره امن پخش باز نشد. اینترنت همراه را بررسی کنید و دوباره تلاش کنید.\n              </Text>\n              <View style={styles.operatorBrowserLaunchActions}>\n                <Pressable\n                  onPress={() => setOperatorBrowserAttempt((value) => value + 1)}\n                  style={styles.operatorGatePrimaryButton}\n                >\n                  <Ionicons name=\"refresh\" color=\"#fff\" size={17} />\n                  <Text style={styles.operatorGatePrimaryText}>تلاش دوباره</Text>\n                </Pressable>\n                <Pressable onPress={onClose} style={styles.operatorGateCancelButton}>\n                  <Text style={styles.operatorGateCancelText}>بستن</Text>\n                </Pressable>\n              </View>\n            </>\n          ) : (\n            <>\n              <ActivityIndicator color={COLORS.gold} size=\"large\" />\n              <Text style={styles.operatorBrowserLaunchText}>\n                {launching ? 'در حال باز کردن پخش ویژه همراه در پنجره امن آپاراتچی…' : 'در حال آماده‌سازی پخش…'}\n              </Text>\n              <Text style={styles.operatorBrowserLaunchHint}>\n                پخش در مرورگر درون‌برنامه‌ای باز می‌شود و با بستن آن مستقیم به همین صفحه برمی‌گردید.\n              </Text>\n            </>\n          )}\n        </View>\n      </View>\n    </Modal>\n  );\n}\n`;

source = source.slice(0, start) + replacement + source.slice(end);

replaceOnce(
`  operatorGateOverlay: {`,
`  operatorBrowserLaunchOverlay: { ...absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(3,5,8,0.92)' },\n  operatorBrowserLaunchCard: { width: '100%', maxWidth: 390, paddingHorizontal: 24, paddingVertical: 28, borderRadius: 22, alignItems: 'center', backgroundColor: '#0E1218', borderWidth: 1, borderColor: 'rgba(216,180,90,0.34)' },\n  operatorBrowserBrandIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14, backgroundColor: 'rgba(216,180,90,0.09)', borderWidth: 1, borderColor: 'rgba(216,180,90,0.3)' },\n  operatorBrowserLaunchTitle: { ...rtlText, width: '100%', color: COLORS.text, fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 18 },\n  operatorBrowserLaunchText: { ...rtlText, color: COLORS.text, fontSize: 11.5, lineHeight: 21, fontWeight: '800', textAlign: 'center', marginTop: 14 },\n  operatorBrowserLaunchHint: { ...rtlText, color: COLORS.muted, fontSize: 9.5, lineHeight: 18, textAlign: 'center', marginTop: 8 },\n  operatorBrowserLaunchActions: { marginTop: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },\n  operatorGateOverlay: {`,
  'operator browser styles',
);

await fs.writeFile(path, source, 'utf8');
console.log('Operator playback now uses a branded in-app browser instead of WebView.');
