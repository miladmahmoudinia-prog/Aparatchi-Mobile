import { Platform } from 'react-native';
import { isNativeVpnActive } from '../modules/aparatchi-vpn-detector';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uses Android ConnectivityManager.TRANSPORT_VPN through the local Expo module.
 * Unknown states and native lookup failures are deliberately treated as not confirmed,
 * so the app never blocks content because an external IP service timed out.
 */
export async function checkVpnActive(retries = 0): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const attempts = Math.max(1, retries + 1);
  let latestState = false;

  // Android can report the old VPN transport for a short moment after it is
  // switched off. Sample more than once and trust the newest reading so the
  // blocking screen can clear without restarting the app.
  for (let index = 0; index < attempts; index += 1) {
    latestState = await isNativeVpnActive();
    if (index < attempts - 1) await delay(350);
  }
  return latestState;
}
