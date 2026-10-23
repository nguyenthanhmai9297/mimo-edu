import { defineConfig } from 'vitest/config';

// Runs inside `firebase emulators:exec` (see `npm run test:emulator`).
export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.emulator.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
