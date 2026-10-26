// Static site build: content/*.md + site.config.json -> dist/
//
// No runtime dependencies. Run with `npm run build`.
// Feature blocks are marked "// schema:begin ... end", "// diagram:", "// crawl:";
// tools/make-history.sh uses those markers to rebuild the pre-schema baseline.

import { mkdir, rm, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSite, loadPages, loadImages, PLACEHOLDER } from '../src/lib/site.mjs';
import { esc } from '../src/lib/html.mjs';
import { layout } from '../src/templates/layout.mjs';
import { renderBody } from '../src/templates/pages.mjs';
// schema:begin
import { buildGraph } from '../src/schema/graph.mjs';
// schema:end
// diagram:begin
import { buildReport } from '../src/schema/report.mjs';
// diagram:end

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function renderSitemap(site, pages) {
  const urls = pages
    .filter((page) => !page.noindex)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((page) => {
      const lastmod = (page.dateModified || site.updated).slice(0, 10);
      return `  <url>\n    <loc>${esc(page.url)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function notFoundPage(site) {
  return {
    kind: 'notfound',
    file: '(generated)',
    path: '/404.html',
    url: `${site.siteUrl}/404.html`,
    title: `Page not found | ${site.siteName}`,
    description: 'The page you asked for does not exist on this site.',
    heading: 'Page not found',
    crumb: 'Page not found',
    noindex: true,
    images: [],
    breadcrumb: [],
    keywords: [],
  };
}

/**
 * @param {{ rootDir?: string, outDir?: string, siteUrl?: string, log?: (msg: string) => void }} [options]
 */
export async function build({ rootDir = ROOT, outDir, siteUrl, log = console.log } = {}) {
  const out = outDir ?? path.join(rootDir, 'dist');
  const site = await loadSite(rootDir, { siteUrl });
  site.defaultImage = (await loadImages(rootDir, site, 'site-default'))[0];
  const pages = await loadPages(rootDir, site);

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(path.join(rootDir, 'public'), out, { recursive: true });

  const graphs = new Map();
  // schema:begin
  for (const page of pages) graphs.set(page.path, buildGraph(page, site, pages));
  if ((site.author.sameAs ?? []).some((url) => PLACEHOLDER.test(url))) {
    log('warning: site.config.json still has placeholder sameAs URLs. They were left out of the markup; `npm run validate:strict` will fail until you fix them.');
  }
  // schema:end

  for (const page of pages) {
    const graph = graphs.get(page.path);
    const body = renderBody({ site, page, pages, graph, graphs });
    const file = path.join(out, page.path, 'index.html');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, layout({ site, page, graph, body }));
  }

  const notFound = notFoundPage(site);
  const notFoundBody = `<header class="page-head">
<h1>${esc(notFound.heading)}</h1>
<p class="lede">That address does not exist here. It may have moved, or the link may have a typo.</p>
</header>
<p><a href="/">Go to the home page</a> or read the <a href="/writing/">writing</a>.</p>`;
  await writeFile(path.join(out, '404.html'), layout({ site, page: notFound, body: notFoundBody }));

  await writeFile(path.join(out, 'sitemap.xml'), renderSitemap(site, pages));

  // diagram:begin
  await writeFile(path.join(out, 'schema-report.json'), `${JSON.stringify(buildReport(site, pages, graphs), null, 2)}\n`);
  // diagram:end


  log(`Built ${pages.length} pages into ${path.relative(process.cwd(), out) || '.'} for ${site.siteUrl}`);
  return { site, pages, graphs, outDir: out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  build().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
