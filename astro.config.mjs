import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://lancio.fr',
  compressHTML: true,
  integrations: [
    sitemap({
      customPages: [
        'https://lancio.fr/examples/restaurant/',
        'https://lancio.fr/examples/coiffeur/',
        'https://lancio.fr/examples/avocat/',
        'https://lancio.fr/examples/medecin/',
        'https://lancio.fr/examples/coach-sportif/',
        'https://lancio.fr/examples/salon-de-beaute/',
        'https://lancio.fr/examples/cafe/',
        'https://lancio.fr/examples/pilates/',
        'https://lancio.fr/examples/therapeute/',
        'https://lancio.fr/examples/immobilier/',
        'https://lancio.fr/examples/artisan/',
      ],
    }),
  ],
});
