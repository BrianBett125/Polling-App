import { defineConfig } from 'vitest/config';

// Database rule suite: runs the real migrations on a real Postgres.
// Requires TEST_DATABASE_URL (admin connection to a throwaway Postgres server).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
