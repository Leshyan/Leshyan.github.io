import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  // Warm the HTTP cache for every article page (and the home link) so ClientRouter's
  // fetch during the entry/return animation resolves from cache, not the network.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  vite: {
    build: {
      target: 'es2022',
    },
  },
});
