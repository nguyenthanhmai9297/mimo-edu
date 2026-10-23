import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests only; tests that need the Firebase emulator run via `npm run test:emulator`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.emulator.test.ts'],
  },
});
