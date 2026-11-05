import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:4002';

  return {
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: proxyTarget.startsWith('https'),
        },
        '/socket.io': {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
          secure: proxyTarget.startsWith('https'),
        },
      },
    },
    plugins: [tailwindcss(), react()],
  };
});
