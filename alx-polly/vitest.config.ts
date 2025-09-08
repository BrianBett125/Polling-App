import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.ts'],
  },
  css: {
    // Prevent Vitest/Vite from attempting to load PostCSS config during tests
    postcss: null,
  },
});