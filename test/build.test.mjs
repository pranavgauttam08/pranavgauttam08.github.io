import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../scripts/build.mjs';
import { makeProject, ROOT, SITE_URL, read } from './helpers/project.mjs';

let project;
before(async () => { project = await makeProject(); });
after(() => project.cleanup());

async function digest(dir) {
  const hash = createHash('sha256');
  const walk = async (d) => {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else hash.update(path.relative(dir, full)).update(await readFile(full));
    }
  };
  await walk(dir);
  return hash.digest('hex');
}

test('the build is deterministic', async () => {
  const again = path.join(project.dir, 'dist-again');
  await build({ rootDir: project.dir, outDir: again, siteUrl: SITE_URL, log: () => {} });
  assert.equal(await digest(again), await digest(project.dist));
});

test('expected outputs exist', async () => {
  for (const f of ['index.html', 'about/index.html', 'writing/index.html', 'schema/index.html', '404.html', 'sitemap.xml', 'robots.txt', 'llms.txt', 'schema-report.json']) {
    assert.ok((await read(path.join(project.dist, f))).length > 0, f);
  }
});

test('the sitemap lists every indexable page and not the 404', async () => {
  const xml = await read(path.join(project.dist, 'sitemap.xml'));
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.includes(`${SITE_URL}/`));
  assert.ok(locs.includes(`${SITE_URL}/writing/typed-json-ld-pipeline/`));
  assert.ok(!locs.some((l) => l.includes('404')));
});

test('the 404 page is noindex and has no structured data', async () => {
  const html = await read(path.join(project.dist, '404.html'));
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /ld\+json/);
});

test('JSON-LD is in the initial HTML, not injected by script', async () => {
  const html = await read(path.join(project.dist, 'index.html'));
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /<h1/);
});

test('schema-report.json lists a graph per page', async () => {
  const report = JSON.parse(await read(path.join(project.dist, 'schema-report.json')));
  assert.ok(JSON.stringify(report).includes('#person'));
});

test('the source tree has no node_modules dependency', async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
  assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), []);
});
