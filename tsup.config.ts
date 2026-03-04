import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/url.ts',
    'src/browser.ts',
    'src/worker.ts',
    'src/react/index.ts',
    'src/cli/index.ts',
    'src/cli/bin.ts',
  ],
  format: ['esm'],
  dts: true,
  splitting: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  shims: true,
  external: ['react'],
  banner: ({ format }) => {
    // bin.ts needs the shebang
    return {};
  },
});
