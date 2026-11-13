import { defineConfig } from 'vitest/config';

// base 用相對路徑，放在 GitHub Pages 的任何子路徑下都能運作。
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
