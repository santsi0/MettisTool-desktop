import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri odottaa kiinteää porttia kehitystilassa.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] }
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Windows 10/11 WebView2 = Chromium, joten moderni tuloste riittää.
    target: 'chrome110',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('src/tools/modules')) return 'tools';
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        }
      }
    }
  }
});
