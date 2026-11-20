import { defineConfig } from 'vite';

export default defineConfig({
  // Względne ścieżki — zbudowana gra działa z dowolnego katalogu (itch.io, GitHub Pages).
  base: './',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    // Phaser jest duży; osobny chunk ułatwia cache'owanie.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
    chunkSizeWarningLimit: 1600,
  },
});
