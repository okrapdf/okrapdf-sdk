import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    chat: 'src/chat/index.ts',
    settings: 'src/settings/index.ts',
    extraction: 'src/extraction/index.ts',
    hooks: 'src/hooks.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
});
