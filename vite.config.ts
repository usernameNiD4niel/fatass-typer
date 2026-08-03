/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Web app only. Desktop-first: min supported width 1024px.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    target: 'es2022',
    /*
     * Source maps by environment (spec §16).
     *
     * On in every mode but production, and switchable back on there with
     * `VITE_SOURCEMAP=true` — which is what makes a production stack trace
     * readable when one actually needs reading.
     */
    sourcemap: process.env.VITE_SOURCEMAP === 'true' || mode !== 'production',
    rollupOptions: {
      output: {
        /*
         * Dependencies change far less often than the game does. Splitting them
         * out means a gameplay tweak does not invalidate ~190kB of vendor code
         * in everyone's cache. The screens split themselves, through `lazy()`
         * in `App.tsx`.
         */
        manualChunks: (id: string) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Playwright owns e2e (step G4); keep it out of the unit run.
    exclude: ['node_modules', 'dist', 'e2e'],
    restoreMocks: true,
    css: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html'],
      // game-core carries the rules, so it is the code that must stay covered.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/test/**'],
    },
  },
}));
