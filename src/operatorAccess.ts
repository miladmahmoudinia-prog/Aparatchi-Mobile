import * as Network from 'expo-network';

export type MobileOperatorAccessStatus =
  | 'allowed'
  | 'wifi'
  | 'vpn'
  | 'offline'
  | 'unknown';

export type MobileOperatorAccessResult = {
  status: MobileOperatorAccessStatus;
  networkType?: string;
};

export async function checkMobileOperatorAccess(): Promise<MobileOperatorAccessResult> {
  try {
    const state = await Network.getNetworkStateAsync();
    const type = state.type ? String(state.type) : Network.NetworkStateType.UNKNOWN;

    if (state.isConnected === false || state.isInternetReachable === false) {
      return { status: 'offline', networkType: type };
    }

    if (type === Network.NetworkStateType.CELLULAR) {
      return { status: 'allowed', networkType: type };
    }

    if (type === Network.NetworkStateType.VPN) {
      return { status: 'vpn', networkType: type };
    }

    if (
      type === Network.NetworkStateType.WIFI ||
      type === Network.NetworkStateType.ETHERNET ||
      type === Network.NetworkStateType.BLUETOOTH ||
      type === Network.NetworkStateType.WIMAX
    ) {
      return { status: 'wifi', networkType: type };
    }

    return { status: 'unknown', networkType: type };
  } catch {
    return { status: 'unknown' };
  }
}
