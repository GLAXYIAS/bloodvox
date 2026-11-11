import { defineConfig } from 'vite';

// Extra dev-server hostnames are supplied per process (e.g. the cloud preview
// domain) so no machine-specific hostname is baked into the repo.
const extraHosts = (process.env.VITE_ALLOWED_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    allowedHosts: extraHosts,
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
