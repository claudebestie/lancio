import type { AstroIntegration } from 'astro';
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function findHtmlFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findHtmlFiles(full, files);
    } else if (entry === 'index.html') {
      files.push(full);
    }
  }
  return files;
}

export default function sitemapIntegration(): AstroIntegration {
  return {
    name: 'lancio-sitemap',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const distDir = dir.pathname.replace(/\/$/, '');
        const site = 'https://lancio.fr';
        const today = new Date().toISOString().split('T')[0];

        const htmlFiles = findHtmlFiles(distDir);
        const urls: { loc: string; priority: string; changefreq: string; lastmod: string }[] = [];

        for (const file of htmlFiles) {
          const rel = relative(distDir, file).replace(/index\.html$/, '').replace(/\\/g, '/');
          const path = '/' + rel;

          // Skip 404 and admin pages
          if (path.includes('/404') || path.startsWith('/api/') || path.startsWith('/admin/')) {
            continue;
          }

          let priority = '0.5';
          let changefreq = 'monthly';

          if (path === '/') {
            priority = '1.0';
            changefreq = 'daily';
          } else if (path.startsWith('/site-web-')) {
            priority = '0.8';
            changefreq = 'weekly';
          } else if (path === '/blog/') {
            priority = '0.8';
            changefreq = 'daily';
          } else if (path.startsWith('/blog/') && path !== '/blog/') {
            priority = '0.7';
            changefreq = 'weekly';
          } else if (path === '/exemples/') {
            priority = '0.7';
            changefreq = 'weekly';
          } else if (path.startsWith('/exemples/') && path !== '/exemples/') {
            priority = '0.6';
            changefreq = 'monthly';
          } else if (path.startsWith('/mentions-legales/')) {
            priority = '0.3';
            changefreq = 'yearly';
          }

          urls.push({ loc: `${site}${path}`, priority, changefreq, lastmod: today });
        }

        // Sort: homepage first, then by priority descending, then alphabetically
        urls.sort((a, b) => {
          if (a.loc === `${site}/`) return -1;
          if (b.loc === `${site}/`) return 1;
          const pDiff = parseFloat(b.priority) - parseFloat(a.priority);
          if (pDiff !== 0) return pDiff;
          return a.loc.localeCompare(b.loc);
        });

        // Generate sitemap XML
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

        writeFileSync(join(distDir, 'sitemap.xml'), xml);
        console.log(`[sitemap] Generated sitemap.xml with ${urls.length} URLs`);

        // Also generate sitemap-index.xml pointing to sitemap.xml (for robots.txt compatibility)
        const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${site}/sitemap.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;

        writeFileSync(join(distDir, 'sitemap-index.xml'), sitemapIndex);
        console.log('[sitemap] Generated sitemap-index.xml');
      },
    },
  };
}
