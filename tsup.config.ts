import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  sourcemap: true,
  clean: true,
  target: 'node20',
  format: ['cjs'],
  splitting: false,
  dts: false,
  minify: true,
  treeshake: false,
  metafile: true,
});
