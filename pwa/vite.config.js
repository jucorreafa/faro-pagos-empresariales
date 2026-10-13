import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA: se puede "instalar" en el celular y abre como app.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icono.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Faro · Pagos Empresariales',
        short_name: 'Faro',
        description: 'Proyecto demostrativo de Arquitectura para Plataformas Fintech (UIDE)',
        lang: 'es',
        theme_color: '#102A43',
        background_color: '#EEF3F2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icono-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Las respuestas de las APIs NUNCA se guardan en caché: siempre datos en vivo.
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
});
