import { requireOptionalNativeModule } from 'expo';

type AparatchiVpnDetectorNativeModule = {
  isVpnActive(): Promise<boolean>;
};

const nativeModule = requireOptionalNativeModule<AparatchiVpnDetectorNativeModule>(
  'AparatchiVpnDetector',
);

/**
 * Returns true only when Android reports an active VPN transport.
 * A missing native module or native exception is treated as an unknown/non-confirmed state,
 * never as a reason to block the user's content.
 */
export async function isNativeVpnActive(): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    return Boolean(await nativeModule.isVpnActive());
  } catch {
    return false;
  }
}
