import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, decode, stripTags, visibleText, pngSize } from '../src/lib/html.mjs';
import { parseFrontMatter } from '../src/lib/frontmatter.mjs';
import { renderMarkdown, slugify } from '../src/lib/markdown.mjs';

test('esc and decode round-trip the characters that matter', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  assert.equal(decode(esc('Tom & "Jerry" <3')), 'Tom & "Jerry" <3');
});

test('visibleText ignores scripts, styles and tags', () => {
  const html = '<style>p{}</style><script>var a=1</script><h1>Hello <em>world</em></h1>';
  assert.equal(visibleText(html).trim(), 'Hello world');
  assert.equal(stripTags('<b>x</b>'), 'x');
});

test('pngSize reads width and height from a PNG header', () => {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf);
  buf.writeUInt32BE(1200, 16);
  buf.writeUInt32BE(630, 20);
  assert.deepEqual(pngSize(buf), { width: 1200, height: 630 });
});

test('front matter parses scalars and leaves the body intact', () => {
  const { data, body } = parseFrontMatter('---\ntitle: Hello\ndate: 2026-10-01\n---\n\nBody text\n');
  assert.equal(data.title, 'Hello');
  assert.match(String(data.date), /2026-10-01/);
  assert.match(body, /Body text/);
});

test('markdown renders headings with slug ids, escapes raw html and counts words', () => {
  const { html, wordCount } = renderMarkdown('## Why it works\n\nOne two <script>x</script> three.\n');
  assert.match(html, /<h2 id="why-it-works"/);
  assert.doesNotMatch(html, /<script>/);
  assert.ok(wordCount >= 4);
  assert.equal(slugify('Why it works!'), 'why-it-works');
});
