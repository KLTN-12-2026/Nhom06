import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router/') ||
            id.includes('/node_modules/react-router-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('/node_modules/@tanstack/')) {
            return 'vendor-tanstack';
          }
          if (
            id.includes('/node_modules/recharts/') ||
            id.includes('/node_modules/d3-') ||
            id.includes('/node_modules/victory-vendor/')
          ) {
            return 'vendor-recharts';
          }
          if (
            id.includes('/node_modules/zod/') ||
            id.includes('/node_modules/react-hook-form/') ||
            id.includes('/node_modules/@hookform/')
          ) {
            return 'vendor-forms';
          }
          if (
            id.includes('/node_modules/@radix-ui/') ||
            id.includes('/node_modules/lucide-react/')
          ) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
