import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/proxy/github-api': {
            target: 'https://api.github.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/proxy\/github-api/, ''),
          },
          '/proxy/github-raw': {
            target: 'https://raw.githubusercontent.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/proxy\/github-raw/, ''),
          },
        },
      },
      preview: {
        port: 3000,
        proxy: {
          '/proxy/github-api': {
            target: 'https://api.github.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/proxy\/github-api/, ''),
          },
          '/proxy/github-raw': {
            target: 'https://raw.githubusercontent.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/proxy\/github-raw/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
