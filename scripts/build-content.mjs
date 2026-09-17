import { build } from 'vite';
// MV3 content scripts are classic scripts. Bundle separately so shared UI
// dependencies cannot introduce module imports into the injected entry point.
await build({
  configFile: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/content/messages.ts',
      name: 'GuideRailMessages',
      formats: ['iife'],
      fileName: () => 'assets/messages.js',
    },
  },
});
