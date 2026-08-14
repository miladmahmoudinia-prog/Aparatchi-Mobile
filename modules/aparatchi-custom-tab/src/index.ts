import { requireNativeModule } from 'expo-modules-core';

type CustomTabOpenResult = {
  opened: boolean;
  browserPackage?: string;
  explicitComponent?: boolean;
};

type AparatchiCustomTabNativeModule = {
  openAsync(url: string): Promise<CustomTabOpenResult>;
};

export default requireNativeModule<AparatchiCustomTabNativeModule>('AparatchiCustomTab');
