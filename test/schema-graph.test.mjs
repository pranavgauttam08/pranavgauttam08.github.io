import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadSite, loadPages } from '../src/lib/site.mjs';
import { buildGraph, cleanSameAs } from '../src/schema/graph.mjs';
import { serialiseGraph } from '../src/schema/render.mjs';
import { checkGraph } from '../src/schema/rules.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, SITE_URL } from './helpers/project.mjs';

const hasArticle = existsSync(path.join(ROOT, 'content/writing/typed-json-ld-pipeline.md'));
let site;
let pages;
before(async () => {
  site = await loadSite(ROOT, { siteUrl: SITE_URL });
  pages = await loadPages(ROOT, site);
});

const typesOf = (n) => [].concat(n['@type']);
const graphFor = (kind) => buildGraph(pages.find((p) => p.kind === kind), site, pages);

test('every node has a unique absolute @id on the site origin', () => {
  for (const page of pages) {
    const ids = buildGraph(page, site, pages).map((n) => n['@id']);
    assert.equal(new Set(ids).size, ids.length, page.path);
    for (const id of ids) assert.ok(id.startsWith(`${SITE_URL}/`), id);
  }
});

test('the person and website ids are identical on every page', () => {
  const sets = pages.map((p) => buildGraph(p, site, pages).filter((n) => /#(person|website)$/.test(n['@id'])).map((n) => n['@id']).join());
  assert.equal(new Set(sets).size, 1);
});

test('article pages carry an Article node tied to the page, author and dates', { skip: !hasArticle }, () => {
  const nodes = graphFor('article');
  const article = nodes.find((n) => typesOf(n).some((t) => /Article|BlogPosting/.test(t)));
  assert.ok(article);
  assert.ok(article.headline && article.datePublished && article.author?.['@id']);
  assert.ok(Array.isArray(article.image) && article.image.every((u) => u.startsWith('https://')));
});

test('the writing index exposes an ItemList of articles', { skip: !hasArticle }, () => {
  const list = graphFor('writing-index').find((n) => typesOf(n).includes('ItemList'));
  const articles = pages.filter((p) => p.kind === 'article');
  assert.ok(list && list.itemListElement.length === articles.length && articles.length >= 1);
});

test('breadcrumbs only exist where there is a trail of two or more', () => {
  const home = buildGraph(pages.find((p) => p.path === '/' || p.path === ''), site, pages);
  assert.ok(!home.some((n) => typesOf(n).includes('BreadcrumbList')));
});

test('placeholder sameAs links are dropped, real ones kept', () => {
  assert.deepEqual(cleanSameAs(['https://github.com/x', 'https://www.linkedin.com/in/REPLACE_ME']), ['https://github.com/x']);
});

test('serialised JSON-LD cannot close the script tag', () => {
  const out = serialiseGraph([{ '@id': 'x', name: '</script><script>alert(1)</script>' }]);
  assert.ok(!out.includes('</script>'));
  assert.ok(JSON.parse(out)['@graph'][0].name.includes('</script>'));
});

test('generated graphs pass the graph rules', () => {
  for (const page of pages) {
    const doc = JSON.parse(serialiseGraph(buildGraph(page, site, pages)));
    const errors = checkGraph(doc, { siteUrl: SITE_URL, strict: true }).filter((i) => i.level === 'error');
    assert.deepEqual(errors, [], page.path);
  }
});
