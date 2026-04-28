import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
