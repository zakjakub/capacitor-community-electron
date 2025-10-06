import { setupElectronDeepLinking } from './ElectronDeepLinking';
import { CapacitorSplashScreen } from './ElectronSplashScreen';
import type {
  CapacitorElectronConfig,
  ElectronCapacitorDeeplinkingConfig,
  ElectronConfig,
  SplashOptions,
} from './definitions';
import { CapElectronEventEmitter, getCapacitorElectronConfig, setupCapacitorElectronPlugins } from './util';

export type { SplashOptions, ElectronConfig, CapacitorElectronConfig, ElectronCapacitorDeeplinkingConfig };

export {
  CapacitorSplashScreen,
  CapElectronEventEmitter,
  getCapacitorElectronConfig,
  setupCapacitorElectronPlugins,
  setupElectronDeepLinking,
};
