import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:4002',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:4002',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  plugins: [tailwindcss(), react()],
});
