import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.testapp',
  appName: 'test-app',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
};

export default config;
