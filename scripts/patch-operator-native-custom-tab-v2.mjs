import fs from 'node:fs/promises';

const path = 'App.tsx';
let source = await fs.readFile(path, 'utf8');

const replaceOnce = (from, to, label) => {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing patch marker: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Non-unique patch marker: ${label}`);
  source = source.slice(0, index) + to + source.slice(index + from.length);
};

replaceOnce(
  "import * as WebBrowser from 'expo-web-browser';\n",
  "import * as WebBrowser from 'expo-web-browser';\nimport AparatchiCustomTab from './modules/aparatchi-custom-tab/src';\n",
  'native custom tab import',
);

const functionStart = source.indexOf('function OperatorWebModal({');
const functionEnd = source.indexOf('\nfunction VpnBlockModal({', functionStart);
if (functionStart < 0 || functionEnd < 0) throw new Error('OperatorWebModal block not found.');

const replacement = `function OperatorWebModal({
  request,
  onClose,
}: {
  request: OperatorWebRequest;
  onClose: () => void;
}) {
  const [operatorBrowserAttempt, setOperatorBrowserAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const openOperatorBrowser = async () => {
      try {
        if (Platform.OS === 'android') {
          // Upera/Filimo requires a real browser context and blocks embedded
          // WebViews. Use our native Android Custom Tab launcher instead of
          // expo-web-browser so the Intent is pinned to one concrete browser
          // activity and Android does not show an “Open with…” resolver.
          const result = await AparatchiCustomTab.openAsync(request.url);
          if (cancelled) return;
          if (!result?.opened) throw new Error('Native Custom Tab did not open.');
          closeTimerRef.current = setTimeout(onClose, 300);
          return;
        }

        // iOS has no Android-style app chooser here, so SafariViewController
        // remains the correct provider-compliant browser surface.
        await WebBrowser.openBrowserAsync(request.url, {
          toolbarColor: '#090B10',
          secondaryToolbarColor: '#11151C',
          controlsColor: COLORS.gold,
          showTitle: false,
          enableBarCollapsing: true,
          enableDefaultShareMenuItem: false,
          dismissButtonStyle: 'close',
        });
        if (!cancelled) onClose();
      } catch {
        if (cancelled) return;
        setFailed(true);
      }
    };

    void openOperatorBrowser();
    return () => {
      cancelled = true;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [request.url, operatorBrowserAttempt]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.operatorBrowserLaunchOverlay}>
        <View style={styles.operatorBrowserLaunchCard}>
          <View style={styles.operatorBrowserBrandIcon}>
            <Ionicons name="film-outline" color={COLORS.gold} size={26} />
          </View>
          {failed ? (
            <>
              <Text numberOfLines={1} style={styles.operatorBrowserLaunchTitle}>{request.title}</Text>
              <Text style={styles.operatorBrowserLaunchText}>
                مرورگر امن پخش باز نشد. اینترنت همراه و نصب بودن Chrome را بررسی کنید و دوباره تلاش کنید.
              </Text>
              <View style={styles.operatorBrowserLaunchActions}>
                <Pressable
                  onPress={() => setOperatorBrowserAttempt((value) => value + 1)}
                  style={styles.operatorGatePrimaryButton}
                >
                  <Ionicons name="refresh" color="#fff" size={17} />
                  <Text style={styles.operatorGatePrimaryText}>تلاش دوباره</Text>
                </Pressable>
                <Pressable onPress={onClose} style={styles.operatorGateCancelButton}>
                  <Text style={styles.operatorGateCancelText}>بستن</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <ActivityIndicator color={COLORS.gold} size="large" />
          )}
        </View>
      </View>
    </Modal>
  );
}
`;

source = source.slice(0, functionStart) + replacement + source.slice(functionEnd);
await fs.writeFile(path, source);

console.log(JSON.stringify({
  androidUsesExpoWebBrowser: false,
  androidUsesNativeExplicitCustomTab: true,
  loadingTextRemoved: true,
  iosBrowserSurfacePreserved: true,
}, null, 2));
