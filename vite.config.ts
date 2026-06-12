import { defineConfig } from 'vite';

// base './' so the build works at any path (GitHub Pages project site included)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
