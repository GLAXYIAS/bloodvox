import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Extra dev-server hostnames are supplied per process (e.g. the cloud preview
// domain) so no machine-specific hostname is baked into the repo.
const extraHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig(({ command }) => ({
  // Production is served from https://glaxyias.github.io/bloodvox/.
  base: command === 'build' ? '/bloodvox/' : '/',
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    allowedHosts: extraHosts,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lab: fileURLToPath(new URL('./ragdoll-lab.html', import.meta.url)),
      },
    },
  },
}));
