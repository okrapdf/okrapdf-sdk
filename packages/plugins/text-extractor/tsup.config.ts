import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/manifest.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
