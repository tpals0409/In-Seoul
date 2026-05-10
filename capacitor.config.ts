import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inseoul.app',
  appName: 'InSeoul',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
};

export default config;
