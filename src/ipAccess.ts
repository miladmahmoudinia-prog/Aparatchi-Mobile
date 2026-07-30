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
  for (let index = 0; index < attempts; index += 1) {
    const active = await isNativeVpnActive();
    if (active) return true;
    if (index < attempts - 1) await delay(120);
  }
  return false;
}
