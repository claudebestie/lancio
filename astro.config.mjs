import { defineConfig } from 'astro/config';
import sitemap from './src/integrations/sitemap.ts';

export default defineConfig({
  site: 'https://lancio.fr',
  compressHTML: true,
  integrations: [sitemap()],
});
