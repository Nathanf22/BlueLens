import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  bundle: true,
  // These packages use CJS dynamic require — let Node resolve them at runtime
  external: ['@google/genai', 'openai', 'google-auth-library'],
});
