// Document shell: head metadata, header, navigation, footer.
//
// Lines between "// schema:begin" and "// schema:end" (and the diagram / crawl
// equivalents) mark feature blocks. The tools/ history script uses them to rebuild
// the "before" version of the site for a before/after pull request.

import { esc } from '../lib/html.mjs';
import { PLACEHOLDER } from '../lib/site.mjs';
// schema:begin
import { renderJsonLdScript } from '../schema/render.mjs';
// schema:end

export function navItems() {
  const items = [
    { href: '/', label: 'Home' },
    { href: '/writing/', label: 'Writing' },
    { href: '/about/', label: 'About' },
  ];
  // diagram:begin
  items.push({ href: '/schema/', label: 'Schema' });
  // diagram:end
  return items;
}

export function footerLinks(site) {
  const links = [{ href: site.repoUrl, label: 'Source on GitHub' }];
  for (const url of site.author.sameAs ?? []) {
    if (PLACEHOLDER.test(url)) continue;
    if (url.includes('linkedin.com')) links.push({ href: url, label: 'LinkedIn' });
  }
  links.push({ href: '/sitemap.xml', label: 'Sitemap' });
  // crawl:begin
  links.push({ href: '/llms.txt', label: 'llms.txt' });
  // crawl:end
  return links;
}

/** Visible breadcrumb navigation. Built from the same trail as the BreadcrumbList markup. */
export function renderBreadcrumbs(page, site) {
  if (page.breadcrumb.length < 2) return '';
  const last = page.breadcrumb.length - 1;
  const items = page.breadcrumb
    .map((crumb, index) => {
      if (index === last) return `<li aria-current="page">${esc(crumb.name)}</li>`;
      const href = crumb.url.replace(site.siteUrl, '') || '/';
      return `<li><a href="${esc(href)}">${esc(crumb.name)}</a></li>`;
    })
    .join('');
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items}</ol></nav>`;
}

function headMeta(site, page) {
  const image = page.images[0] ?? site.defaultImage;
  const tags = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}">`,
    `<link rel="canonical" href="${esc(page.url)}">`,
    `<meta name="robots" content="${page.noindex ? 'noindex' : 'index, follow, max-image-preview:large'}">`,
    `<meta name="theme-color" content="#edf1f3">`,
    `<meta property="og:type" content="${page.kind === 'article' ? 'article' : 'website'}">`,
    `<meta property="og:site_name" content="${esc(site.siteName)}">`,
    `<meta property="og:locale" content="${esc(site.locale)}">`,
    `<meta property="og:title" content="${esc(page.title)}">`,
    `<meta property="og:description" content="${esc(page.description)}">`,
    `<meta property="og:url" content="${esc(page.url)}">`,
  ];
  if (image) {
    tags.push(
      `<meta property="og:image" content="${esc(image.url)}">`,
      `<meta property="og:image:width" content="${image.width}">`,
      `<meta property="og:image:height" content="${image.height}">`,
      `<meta property="og:image:alt" content="${esc(page.title)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    );
  }
  if (page.kind === 'article') {
    tags.push(
      `<meta property="article:published_time" content="${esc(page.datePublished)}">`,
      `<meta property="article:modified_time" content="${esc(page.dateModified || page.datePublished)}">`,
      `<meta property="article:author" content="${esc(`${site.siteUrl}/about/`)}">`,
    );
  }
  if (site.googleSiteVerification) {
    tags.push(`<meta name="google-site-verification" content="${esc(site.googleSiteVerification)}">`);
  }
  tags.push(
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="stylesheet" href="/assets/site.css">`,
  );
  return tags.join('\n');
}

/**
 * @param {{ site: object, page: object, body: string, graph?: object[] }} ctx
 */
export function layout({ site, page, body, graph }) {
  let jsonLd = '';
  // schema:begin
  if (graph) jsonLd = renderJsonLdScript(graph);
  // schema:end

  const nav = navItems()
    .map((item) => {
      const current = item.href === page.path || (item.href !== '/' && page.path.startsWith(item.href));
      return `<li><a href="${esc(item.href)}"${current ? ' aria-current="page"' : ''}>${esc(item.label)}</a></li>`;
    })
    .join('');

  const footer = footerLinks(site)
    .map((link) => `<li><a href="${esc(link.href)}"${/^https?:/.test(link.href) ? ' rel="noopener"' : ''}>${esc(link.label)}</a></li>`)
    .join('');

  return `<!doctype html>
<html lang="${esc(site.language)}">
<head>
${headMeta(site, page)}
${jsonLd}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
<div class="wrap bar">
<a class="brand" href="/">${esc(site.siteName)}</a>
<nav aria-label="Primary"><ul>${nav}</ul></nav>
</div>
</header>
<main id="main" class="wrap">
${body}
</main>
<footer class="site-footer">
<div class="wrap foot">
<p>Written and built by ${esc(site.author.name)}. Last updated <time datetime="${esc(site.updated)}">${esc(formatDate(site.updated))}</time>.</p>
<ul>${footer}</ul>
</div>
</footer>
</body>
</html>
`;
}

export function formatDate(iso) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
