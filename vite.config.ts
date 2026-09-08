import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/target/**']
    },
    proxy: {
      '/api/rsi-guides': {
        target: 'https://support.robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rsi-guides/, '')
      },
      '/api/rsi-status-page': {
        target: 'https://status.robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: () => '/'
      },
      '/api/rsi-status': {
        target: 'https://status.robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: () => '/index.xml'
      },
      '/api/rsi-patch-notes': {
        target: 'https://robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: () => '/spectrum/community/SC/forum/190048'
      },
      '/api/rsi-spectrum': {
        target: 'https://robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rsi-spectrum/, '')
      },
      '/api/rsi-news': {
        target: 'https://robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rsi-news/, '/en/comm-link/rss')
      },
      '/api/rsi-comm-link': {
        target: 'https://robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rsi-comm-link/, '')
      },
      '/api/rsi-organizations': {
        target: 'https://robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rsi-organizations/, '')
      },
      '/api/rsi-citizens': {
        target: 'https://robertsspaceindustries.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rsi-citizens/, '')
      },
      '/api/uex-assets': {
        target: 'https://assets.uexcorp.space',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/uex-assets/, ''),
        configure: (proxy) => {
          proxy.on('proxyRes', (response) => {
            response.headers['content-type'] = 'image/jpeg';
            delete response.headers['x-content-type-options'];
          });
        }
      },
      '/api/uex': {
        target: 'https://api.uexcorp.uk/2.0',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/uex/, '')
      },
      '/api/cstone': {
        target: 'https://cstone.space',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cstone/, '')
      },
      '/api/sc-tools-media': {
        target: 'https://media.starcitizen.tools',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sc-tools-media/, '')
      },
      '/api/sc-wiki': {
        target: 'https://api.star-citizen.wiki/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sc-wiki/, '')
      }
    }
  },
  envPrefix: ['VITE_', 'TAURI_']
});
