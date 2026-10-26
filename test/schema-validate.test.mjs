import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../scripts/build.mjs';
import { validateDist } from '../src/schema/validate.mjs';
import { extractJsonLdBlocks } from '../src/schema/extract.mjs';
import { existsSync } from 'node:fs';
import { makeProject, read, write, page, SITE_URL, ROOT } from './helpers/project.mjs';

// Early commits in the history have no articles yet; those cases skip until the first one exists.
const hasArticle = existsSync(path.join(ROOT, 'content/writing/typed-json-ld-pipeline.md'));

let project;
const ARTICLE = '/writing/typed-json-ld-pipeline/';

before(async () => {
  project = await makeProject();
});
after(() => project.cleanup());

const codes = (result) => result.issues.map((i) => i.code);
const run = (strict = false) => validateDist({ rootDir: project.dir, distDir: project.dist, siteUrl: SITE_URL, strict });

// Each mutation edits one built page, validates, then restores it.
async function mutate(urlPath, edit, strict = false) {
  const file = page(project, urlPath);
  const original = await read(file);
  try {
    await write(file, edit(original));
    return await run(strict);
  } finally {
    await write(file, original);
  }
}

// Replace the JSON-LD in a page with a modified copy of the parsed graph.
const editGraph = (fn) => (html) => {
  const [block] = extractJsonLdBlocks(html);
  const doc = JSON.parse(block);
  fn(doc);
  return html.replace(block, JSON.stringify(doc));
};

test('the unmodified build passes strict validation with no errors', async () => {
  const result = await run(true);
  const errors = result.issues.filter((i) => i.level === 'error');
  assert.deepEqual(errors, []);
});

test('a dangling @id reference is reported (LD008)', { skip: !hasArticle }, async () => {
  const result = await mutate(ARTICLE, editGraph((doc) => {
    const article = doc['@graph'].find((n) => [].concat(n['@type']).some((t) => /Article|BlogPosting/.test(t)));
    article.author = { '@id': `${SITE_URL}/#nobody` };
  }));
  assert.ok(codes(result).includes('LD008'), codes(result).join(','));
});

test('a date without a valid ISO format is reported (LD011)', { skip: !hasArticle }, async () => {
  const result = await mutate(ARTICLE, editGraph((doc) => {
    const article = doc['@graph'].find((n) => n.datePublished);
    article.datePublished = '26 October 2026';
  }));
  assert.ok(codes(result).includes('LD011'), codes(result).join(','));
});

test('a headline that differs from the visible h1 is reported (LD053)', { skip: !hasArticle }, async () => {
  const result = await mutate(ARTICLE, editGraph((doc) => {
    doc['@graph'].find((n) => n.headline).headline = 'A completely different headline';
  }));
  assert.ok(codes(result).includes('LD053'), codes(result).join(','));
});

test('competing microdata is reported (LD040)', { skip: !hasArticle }, async () => {
  const result = await mutate(ARTICLE, (html) => html.replace('<body', '<body itemscope itemtype="https://schema.org/Article"'));
  assert.ok(codes(result).includes('LD040'), codes(result).join(','));
});

test('a missing JSON-LD block is an error (LD001)', async () => {
  const result = await mutate('/about/', (html) => html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ''));
  assert.ok(codes(result).includes('LD001'), codes(result).join(','));
});

test('invalid JSON in the block is an error (LD002)', async () => {
  const result = await mutate('/about/', (html) => html.replace(/(<script type="application\/ld\+json">\s*)\{/, '$1{,'));
  assert.ok(codes(result).includes('LD002'), codes(result).join(','));
});

test('strict mode rejects a build made for a local origin (LD010)', async () => {
  const dist = path.join(project.dir, 'dist-local');
  await build({ rootDir: project.dir, outDir: dist, siteUrl: 'http://localhost:4173', log: () => {} });
  const result = await validateDist({ rootDir: project.dir, distDir: dist, siteUrl: 'http://localhost:4173', strict: true });
  assert.ok(codes(result).includes('LD010'), codes(result).join(','));
  const lenient = await validateDist({ rootDir: project.dir, distDir: dist, siteUrl: 'http://localhost:4173', strict: false });
  assert.deepEqual(lenient.issues.filter((i) => i.level === 'error'), []);
});

test('a leftover placeholder in the config fails strict mode (X050)', async () => {
  const unreal = await makeProject({ realConfig: false });
  try {
    const result = await validateDist({ rootDir: unreal.dir, distDir: unreal.dist, siteUrl: SITE_URL, strict: true });
    assert.ok(codes(result).includes('X050'), codes(result).join(','));
  } finally {
    await unreal.cleanup();
  }
});

test('a broken internal link is reported', async () => {
  const result = await mutate('/about/', (html) => html.replace('</main>', '<a href="/does-not-exist/">x</a></main>'));
  assert.ok(result.issues.some((i) => i.level === 'error' && /does-not-exist/.test(i.message)));
});
