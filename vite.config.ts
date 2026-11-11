import { defineConfig } from 'vite';

// base './' so the built index.html loads from file:// inside Electron
export default defineConfig({
  base: './',
});
