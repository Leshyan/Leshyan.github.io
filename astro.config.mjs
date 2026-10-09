import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  output: 'static',
  // Warm the HTTP cache for every article page (and the home link) so ClientRouter's
  // fetch during the entry/return animation resolves from cache, not the network.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  markdown: {
    // Classic unified pipeline (Sätteri, the Astro 7 default, runs no remark/rehype
    // plugins): LaTeX math via $inline$ / $$display$$, rendered to HTML+CSS at build.
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
  vite: {
    build: {
      target: 'es2022',
    },
  },
});
