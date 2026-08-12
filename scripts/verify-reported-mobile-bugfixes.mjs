import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('App.tsx', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));

// Preserve the previously verified fixes.
assert.ok(!source.includes('نسخه اصلی'), 'The mobile UI must never fabricate a نسخه اصلی bucket.');
assert.ok(!source.includes('routeTransitionOpacity'), 'The black route-transition overlay must be removed.');
assert.ok(!source.includes('routeTransitionTimerRef'), 'The delayed route transition timer must be removed.');
assert.ok(source.includes('reconcileUperaMediaFiles'), 'Playback/download language reconciliation must be centralized.');
assert.ok(source.includes("title: 'لینک‌های دریافت'"), 'Unclassified downloads must have a neutral label.');
assert.ok(source.includes("label: 'پخش آنلاین'"), 'Unclassified playback must have a neutral label.');
assert.ok(source.includes("titleText.includes('the westies')"), 'The Westies must have a mobile foreign-identity safeguard.');
assert.ok(source.includes("'از بی', 'از به', 'az be'"), 'Az Be documentary safeguard must exist.');
assert.ok(source.includes('contentOffset={{ x: displayedPeople.length * 66, y: 0 }}'), 'Stars rail must start at the physical end without a delayed jump.');
assert.ok(source.includes('contentOffset={{ x: displayedWorks.length * 113, y: 0 }}'), 'Star works rail must start at the physical end without a delayed jump.');
assert.ok(!source.includes('peopleRailRef.current?.scrollToEnd'), 'Stars rail must not use delayed scrollToEnd.');
assert.ok(!source.includes('worksRailRef.current?.scrollToEnd'), 'Works rail must not use delayed scrollToEnd.');
assert.ok(source.includes("sortForCatalogFilter(usableCatalog.slice(0, 900), 'latest')"), 'Category preview must not sort the full catalog before navigation.');

// Latest reported batch.
assert.ok(source.includes('data={[...people].reverse()}'), 'Detail cast rail must start from the right.');
assert.ok(!/horizontal\s+inverted\s+data=\{people\}/m.test(source), 'Detail cast rail must not use inverted together with RTL reversal.');
assert.ok(source.includes('exactEpisodeArtworkFor'), 'Episode artwork must be validated before display.');
assert.ok(source.includes('assets\\/media\\/episodes\\/[a-f0-9]{24}\\.jpg'), 'Only generated exact-episode frames may be trusted.');
assert.ok(source.includes('exactEpisodeArtworkFor(group, item)'), 'Episode cards must use same-series fallback when exact frame is unavailable.');
assert.ok(source.includes('const minimumVisibleMs = 850;'), 'Cold-start minimum splash/skeleton delay must be short.');
assert.ok(source.includes('setTimeout(dismissStartup, 1200)'), 'Cold-start fallback must not hold for five seconds.');
assert.ok(source.includes('const [controlsLocked, setControlsLocked] = useState(false);'), 'Fullscreen player lock state must exist.');
assert.ok(source.includes('const [isMuted, setIsMuted] = useState(false);'), 'Player mute control must exist.');
assert.ok(source.includes('const [playerVolume, setPlayerVolume] = useState(1);'), 'Player volume controls must exist.');
assert.ok(source.includes('if (controlsLocked) return;'), 'Locked fullscreen must ignore video surface taps.');
assert.ok(source.includes('seekBy(-10)'), 'Player must expose ten-second rewind.');
assert.ok(source.includes('seekBy(10)'), 'Player must expose ten-second forward.');
assert.ok(source.includes("name={isMuted || playerVolume <= 0 ? 'volume-mute' : 'volume-high'}"), 'Mute button must be rendered.');
assert.ok(source.includes('accessibilityLabel="قفل کنترل‌ها"'), 'Fullscreen lock button must be rendered.');
assert.ok(source.includes("accessibilityLabel={landscape ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}"), 'Fullscreen toggle must live with the bottom controls.');
assert.ok(source.includes('const chromeVisible = !controlsLocked'), 'All player chrome must hide together while locked.');

assert.equal(pkg.version, '0.15.0');
assert.equal(app.expo.version, '0.15.0');
assert.equal(app.expo.android.versionCode, 20);

console.log('Reported mobile bugfix invariants verified.');
// Triggered after workflow verification was corrected.
