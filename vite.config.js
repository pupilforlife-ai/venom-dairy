import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  envDir: false,
  plugins: [react(), tailwindcss()],
  define: { 'import.meta.env.VITE_LOCAL_DEMO_MODE': JSON.stringify('true') },
  server: { host: '127.0.0.1', port: 4344, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
