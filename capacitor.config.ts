import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inseoul.app',
  appName: 'InSeoul',
  webDir: 'dist',
  // Forward main-thread `console.*` to native Xcode/logcat. Default is 'debug'
  // (debug builds only). Pin explicitly so the contract survives future
  // Capacitor default changes — UAT relies on `[INSEOUL_LLM]` traces.
  // NOTE: Web Worker scope `console.*` is NOT forwarded by WKWebView/Capacitor;
  // worker uses postMessage({type:'trace'}) → main thread → console.warn/error
  // to surface state. See docs/llm-debugging.md.
  loggingBehavior: 'debug',
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    allowsLinkPreview: false,
  },
};

export default config;
