import { defineConfig } from 'vite';

// The dedicated server: one file that runs on Node with nothing else installed (ws is bundled in).
export default defineConfig({
  build: {
    ssr: 'src/server/main.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'cube-crashers-server.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, target: 'node' },
});
