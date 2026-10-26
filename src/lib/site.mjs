// Loads site.config.json and the markdown content, and derives everything a page
// needs (URL, breadcrumb trail, images with real dimensions, word count).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { renderMarkdown } from './markdown.mjs';
import { parseFrontMatter } from './frontmatter.mjs';
import { pngSize } from './html.mjs';

export const PLACEHOLDER = /REPLACE_ME|TODO|YOURSITE|lorem ipsum/i;

export async function loadSite(rootDir, overrides = {}) {
  const raw = JSON.parse(await readFile(path.join(rootDir, 'site.config.json'), 'utf8'));
  const siteUrl = String(overrides.siteUrl ?? process.env.SITE_URL ?? raw.siteUrl).replace(/\/+$/, '');
  const url = new URL(siteUrl);
  return { ...raw, siteUrl, origin: url.origin, host: url.host };
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name.endsWith('.md')) files.push(full);
  }
  return files.sort();
}

function requireField(data, key, file) {
  if (!data[key]) throw new Error(`${file}: front matter is missing "${key}"`);
  return data[key];
}

export async function loadImages(rootDir, site, base) {
  if (!base) return [];
  const variants = [
    { suffix: '16x9', label: '16:9' },
    { suffix: '4x3', label: '4:3' },
    { suffix: '1x1', label: '1:1' },
  ];
  const images = [];
  for (const { suffix, label } of variants) {
    const rel = `/assets/img/${base}-${suffix}.png`;
    const buffer = await readFile(path.join(rootDir, 'public', rel));
    const { width, height } = pngSize(buffer);
    images.push({ path: rel, url: `${site.siteUrl}${rel}`, width, height, ratio: label });
  }
  return images;
}

export async function loadPages(rootDir, site) {
  const contentDir = path.join(rootDir, 'content');
  const files = await walk(contentDir);
  const pages = [];

  for (const file of files) {
    const rel = path.relative(rootDir, file);
    const { data, body } = parseFrontMatter(await readFile(file, 'utf8'));
    const { html, text, wordCount } = renderMarkdown(body);
    const pagePath = requireField(data, 'path', rel);
    pages.push({
      file: rel,
      kind: requireField(data, 'kind', rel),
      path: pagePath,
      url: `${site.siteUrl}${pagePath}`,
      title: requireField(data, 'title', rel),
      description: requireField(data, 'description', rel),
      heading: data.heading ?? data.title,
      lede: data.lede ?? '',
      crumb: data.crumb ?? data.title,
      section: data.section ?? '',
      keywords: data.keywords ?? [],
      datePublished: data.datePublished ?? '',
      dateModified: data.dateModified ?? '',
      dateCreated: data.dateCreated ?? '',
      imageBase: data.image ?? '',
      images: await loadImages(rootDir, site, data.image),
      bodyHtml: html,
      text,
      wordCount,
    });
  }

  const byPath = new Map(pages.map((p) => [p.path, p]));
  for (const page of pages) {
    page.breadcrumb = breadcrumbFor(page, byPath, site);
  }
  return pages;
}

/** Trail of { name, url } from Home to the page. Single source for markup and visible nav. */
function breadcrumbFor(page, byPath, site) {
  const trail = [{ name: 'Home', url: `${site.siteUrl}/` }];
  if (page.path === '/') return trail;
  const segments = page.path.split('/').filter(Boolean);
  for (let n = 1; n < segments.length; n += 1) {
    const ancestor = byPath.get(`/${segments.slice(0, n).join('/')}/`);
    if (ancestor) trail.push({ name: ancestor.crumb, url: ancestor.url });
  }
  trail.push({ name: page.crumb, url: page.url });
  return trail;
}
