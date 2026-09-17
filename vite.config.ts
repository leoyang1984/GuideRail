import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: { css: true, include: ['tests/**/*.test.ts'] },
  build: {
    // The unpacked extension may be running while a development build starts.
    // Keep the previous complete files available until their replacements land.
    emptyOutDir: false,
    rollupOptions: {
      input: { messages: 'src/content/messages.ts', sidepanel: 'src/sidepanel/index.html', 'service-worker': 'src/background/service-worker.ts' },
      output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' },
    },
  },
});
