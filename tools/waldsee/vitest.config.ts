import { defineConfig } from 'vitest/config';

/** runs the generators in this folder (see README): npx vitest run --config tools/waldsee/vitest.config.ts */
export default defineConfig({
  test: {
    include: ['tools/waldsee/*.gen.ts'],
  },
});
