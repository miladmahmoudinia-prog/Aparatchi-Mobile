import * as Network from 'expo-network';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Detects an active VPN using the device network type only.
 * Unknown states and lookup failures are deliberately treated as "not confirmed"
 * so content is never blocked because of a timeout or a public-IP service failure.
 */
export async function checkVpnActive(retries = 2): Promise<boolean> {
  const attempts = Math.max(1, retries + 1);
  for (let index = 0; index < attempts; index += 1) {
    try {
      const state = await Network.getNetworkStateAsync();
      if (String(state.type || '') === String(Network.NetworkStateType.VPN)) return true;
    } catch {
      // An unavailable network-state result is not proof that a VPN is active.
    }
    if (index < attempts - 1) await delay(350);
  }
  return false;
}
