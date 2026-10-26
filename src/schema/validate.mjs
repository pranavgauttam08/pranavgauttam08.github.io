// Validate a built site (dist/) the way a crawler would see it.
//
// Three layers, each with its own rule codes (full table in docs/SCHEMA-SPEC.md):
//   LD***  the JSON-LD graph, and whether it agrees with the page around it
//   HT***  the document head and basic on-page SEO
//   X***   site-wide: sitemap, internal links, images, config, robots.txt, report parity

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { loadSite, PLACEHOLDER } from '../lib/site.mjs';
import { extractJsonLdBlocks, parseJsonLdBlocks, nodesOf } from './extract.mjs';
import { checkGraph } from './rules.mjs';
import { checkPage } from './page-checks.mjs';

const exists = async (file) => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

/** dist/a/b/index.html -> /a/b/ ; dist/404.html -> /404.html */
function urlPathFor(distDir, file) {
  const rel = path.relative(distDir, file).split(path.sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}

async function resolvesInDist(distDir, urlPath) {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const candidates = clean.endsWith('/')
    ? [path.join(distDir, clean, 'index.html')]
    : [path.join(distDir, clean), path.join(distDir, clean, 'index.html'), path.join(distDir, `${clean}.html`)];
  for (const candidate of candidates) {
    if (await exists(candidate)) return true;
  }
  return false;
}

function* stringsIn(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const item of value) yield* stringsIn(item);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) yield* stringsIn(item);
}

/**
 * @param {{ rootDir: string, distDir?: string, siteUrl?: string, strict?: boolean, now?: Date }} options
 */
export async function validateDist({ rootDir, distDir, siteUrl, strict = false, now = new Date() }) {
  const dist = distDir ?? path.join(rootDir, 'dist');
  const site = await loadSite(rootDir, { siteUrl });
  const issues = [];
  const report = (level, code, where, message) => issues.push({ level, code, page: where, message });

  if (!(await exists(dist))) throw new Error(`No build output at ${dist}. Run \`npm run build\` first.`);

  const htmlFiles = (await walk(dist)).filter((f) => f.endsWith('.html')).sort();
  const pages = [];
  const graphsByPath = new Map();
  const canonicals = new Map();
  const titles = new Map();
  const indexable = [];

  for (const file of htmlFiles) {
    const urlPath = urlPathFor(dist, file);
    const html = await readFile(file, 'utf8');
    const isNotFound = urlPath === '/404.html';
    const add = (issue) => report(issue.level, issue.code, urlPath, issue.message);

    const blocks = extractJsonLdBlocks(html);
    const { docs, errors } = parseJsonLdBlocks(blocks);
    for (const message of errors) report('error', 'LD002', urlPath, message);

    if (isNotFound) {
      if (blocks.length) report('warn', 'LD042', urlPath, '404 page should not carry structured data.');
    } else if (!blocks.length) {
      report('error', 'LD001', urlPath, 'No JSON-LD block found in the HTML.');
    }
    if (docs.length > 1) report('warn', 'LD041', urlPath, `${docs.length} JSON-LD blocks; one @graph per page is easier to reason about.`);

    for (const doc of docs) for (const issue of checkGraph(doc, { siteUrl: site.siteUrl, strict, now })) add(issue);

    const nodes = nodesOf(docs);
    for (const issue of checkPage(html, {
      nodes,
      expectedUrl: `${site.siteUrl}${urlPath}`,
      siteUrl: site.siteUrl,
      indexable: !isNotFound,
      requireGraph: !isNotFound,
    })) {
      add(issue);
    }

    // Images and other local files named inside the markup must exist.
    for (const text of stringsIn(nodes)) {
      if (text.startsWith(`${site.siteUrl}/`) && /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(text)) {
        if (!(await resolvesInDist(dist, text.slice(site.siteUrl.length)))) {
          report('error', 'LD057', urlPath, `Markup references ${text}, which is not in the build output.`);
        }
      }
    }

    // Internal links and assets must resolve.
    const targets = new Set([...html.matchAll(/\b(?:href|src)=["'](\/[^"'/][^"']*|\/)["']/g)].map((m) => m[1]));
    for (const target of targets) {
      if (!(await resolvesInDist(dist, target))) report('error', 'X030', urlPath, `Broken internal link or asset: ${target}`);
    }

    const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1];
    if (canonical) canonicals.set(canonical, [...(canonicals.get(canonical) ?? []), urlPath]);
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
    if (title) titles.set(title, [...(titles.get(title) ?? []), urlPath]);

    if (!isNotFound) indexable.push(`${site.siteUrl}${urlPath}`);
    graphsByPath.set(urlPath, nodes);
    pages.push({ path: urlPath, nodes: nodes.length, types: nodes.map((n) => [].concat(n['@type']).join('+')) });
  }

  for (const [canonical, where] of canonicals) {
    if (where.length > 1) report('error', 'X001', where[0], `Canonical ${canonical} is shared by ${where.join(', ')}.`);
  }
  for (const [title, where] of titles) {
    if (where.length > 1) report('warn', 'X002', where[0], `Title "${title}" is shared by ${where.join(', ')}.`);
  }

  // Sitemap: exactly the indexable pages, absolute, with valid dates.
  const sitemapFile = path.join(dist, 'sitemap.xml');
  if (!(await exists(sitemapFile))) {
    report('error', 'X010', '/sitemap.xml', 'sitemap.xml is missing.');
  } else {
    const xml = await readFile(sitemapFile, 'utf8');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const url of indexable) {
      if (!locs.includes(url)) report('error', 'X011', '/sitemap.xml', `Missing from sitemap: ${url}`);
    }
    for (const loc of locs) {
      if (!indexable.includes(loc)) report('error', 'X012', '/sitemap.xml', `Sitemap lists a URL with no page: ${loc}`);
    }
    for (const match of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(match[1])) report('error', 'X013', '/sitemap.xml', `Invalid lastmod ${match[1]}`);
    }
  }

  // Configuration placeholders: a warning while developing, an error under --strict.
  const configText = await readFile(path.join(rootDir, 'site.config.json'), 'utf8');
  const leftover = configText.match(PLACEHOLDER)?.[0];
  if (leftover) {
    report(
      strict ? 'error' : 'warn',
      'X050',
      'site.config.json',
      `Placeholder text "${leftover}" is still in site.config.json. Put in the real value or delete the entry.`,
    );
  }



  const totals = {
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
    info: issues.filter((i) => i.level === 'info').length,
  };
  for (const page of pages) {
    page.errors = issues.filter((i) => i.page === page.path && i.level === 'error').length;
    page.warnings = issues.filter((i) => i.page === page.path && i.level === 'warn').length;
  }
  return { siteUrl: site.siteUrl, strict, pages, issues, totals };
}



const SYMBOL = { error: 'error', warn: 'warning', info: 'note' };

export function formatText(result) {
  const lines = [`Validated ${result.pages.length} pages for ${result.siteUrl}${result.strict ? ' (strict)' : ''}`, ''];
  const width = Math.max(...result.pages.map((p) => p.path.length));
  for (const page of result.pages) {
    const status = page.errors ? 'FAIL' : page.warnings ? 'warn' : 'ok';
    lines.push(`${status.padEnd(5)}${page.path.padEnd(width + 2)}${String(page.nodes).padStart(2)} nodes  ${page.types.join(' ')}`);
  }
  const siteWide = result.issues.filter((i) => !result.pages.some((p) => p.path === i.page));
  const grouped = [...result.pages.map((p) => p.path), ...new Set(siteWide.map((i) => i.page))];
  for (const where of grouped) {
    const list = result.issues.filter((i) => i.page === where);
    if (!list.length) continue;
    lines.push('', where);
    for (const issue of list) lines.push(`  ${SYMBOL[issue.level].padEnd(8)}${issue.code}  ${issue.message}`);
  }
  lines.push('', `${result.totals.errors} errors, ${result.totals.warnings} warnings, ${result.totals.info} notes`);
  return lines.join('\n');
}

export function formatMarkdown(result) {
  const rows = result.pages
    .map((p) => `| \`${p.path}\` | ${p.nodes} | ${p.types.join(', ')} | ${p.errors} | ${p.warnings} |`)
    .join('\n');
  const details = result.issues.length
    ? `\n\n<details><summary>${result.issues.length} findings</summary>\n\n${result.issues
        .map((i) => `- **${i.level}** \`${i.code}\` \`${i.page}\`: ${i.message}`)
        .join('\n')}\n\n</details>`
    : '';
  return `### Structured data validation\n\n${result.totals.errors} errors, ${result.totals.warnings} warnings for ${result.siteUrl}${result.strict ? ' (strict)' : ''}\n\n| Page | Nodes | Types | Errors | Warnings |\n| --- | --- | --- | --- | --- |\n${rows}${details}\n`;
}
