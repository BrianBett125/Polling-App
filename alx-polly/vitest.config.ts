import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.ts'],
  },
  css: {
    // Prevent Vitest/Vite from attempting to load PostCSS config during tests
    postcss: { plugins: [] },
  },
});
