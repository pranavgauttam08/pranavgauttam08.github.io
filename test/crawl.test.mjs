import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderRobots } from '../src/crawl/robots.mjs';
import { parseRobots, canFetch } from '../src/crawl/robots-parse.mjs';
import { BOTS, classifyUserAgent } from '../src/crawl/bots.mjs';
import { renderLlmsTxt } from '../src/crawl/llms.mjs';
import { checkBotAccess } from '../src/crawl/check-access.mjs';
import { analyzeLog, parseLine } from '../src/crawl/logs.mjs';
import { createServer } from '../scripts/serve.mjs';
import { loadSite, loadPages } from '../src/lib/site.mjs';
import { makeProject, ROOT, SITE_URL } from './helpers/project.mjs';

const policy = (crawlers) => parseRobots(renderRobots({ siteUrl: SITE_URL, crawlers }));

test('default policy allows every bot', () => {
  const parsed = policy({ allowSearch: true, allowUserFetch: true, allowTraining: true });
  for (const bot of BOTS) assert.equal(canFetch(parsed, bot.token, '/'), true, bot.token);
});

test('blocking training leaves search, user-fetch and classic engines allowed', () => {
  const parsed = policy({ allowSearch: true, allowUserFetch: true, allowTraining: false });
  for (const bot of BOTS) {
    assert.equal(canFetch(parsed, bot.token, '/'), bot.purpose !== 'training', bot.token);
  }
});

test('classic engines stay allowed even if every AI purpose is blocked', () => {
  const parsed = policy({ allowSearch: false, allowUserFetch: false, allowTraining: false });
  assert.equal(canFetch(parsed, 'Googlebot', '/'), true);
  assert.equal(canFetch(parsed, 'OAI-SearchBot', '/'), false);
  assert.equal(canFetch(parsed, 'GPTBot', '/'), false);
});

test('robots.txt points at the sitemap', () => {
  assert.ok(parseRobots(renderRobots({ siteUrl: SITE_URL, crawlers: {} })).sitemaps.includes(`${SITE_URL}/sitemap.xml`));
});

test('parser: most specific rule wins and Allow beats Disallow on a tie', () => {
  const p = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/ok/\n');
  assert.equal(canFetch(p, 'AnyBot', '/private/x'), false);
  assert.equal(canFetch(p, 'AnyBot', '/private/ok/x'), true);
  assert.equal(canFetch(p, 'AnyBot', '/public'), true);
});

test('user agents are classified by the longest matching token', () => {
  assert.equal(classifyUserAgent('Mozilla/5.0 (compatible; Claude-SearchBot/1.0)').token, 'Claude-SearchBot');
  assert.equal(classifyUserAgent('Mozilla/5.0 (compatible; ClaudeBot/1.0)').token, 'ClaudeBot');
  assert.equal(classifyUserAgent('Mozilla/5.0 Chrome/130 Safari/537.36'), null);
});

test('llms.txt links the pages and stays plain text', async () => {
  const site = await loadSite(ROOT, { siteUrl: SITE_URL });
  const pages = await loadPages(ROOT, site);
  const text = renderLlmsTxt(site, pages, { schemaReport: true });
  assert.match(text, /^# /);
  assert.ok(text.includes(`${SITE_URL}/writing/typed-json-ld-pipeline/`));
});

// ---- bot access check against an in-process server, with and without a simulated firewall ----

let project;
let servers = [];
before(async () => { project = await makeProject(); });
after(async () => {
  for (const s of servers) s.close();
  await project.cleanup();
});

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(project.dist, { handler });
    servers.push(server);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

test('bot check passes when every bot gets the same page', async () => {
  const base = await listen();
  const report = await checkBotAccess(base);
  assert.equal(report.failures, 0);
  assert.ok(report.rows.every((r) => r.status === 200 && r.hasJsonLd));
});

test('bot check catches a firewall that blocks one allowed bot', async () => {
  const base = await listen((req, res) => {
    if (/PerplexityBot/.test(req.headers['user-agent'] ?? '') && req.url !== '/robots.txt') {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('blocked');
      return true;
    }
  });
  const report = await checkBotAccess(base);
  const failed = report.rows.filter((r) => r.failure).map((r) => r.bot);
  assert.deepEqual(failed, ['PerplexityBot']);
});

test('bot check catches a bot served an empty shell instead of the page', async () => {
  const base = await listen((req, res) => {
    if (/OAI-SearchBot/.test(req.headers['user-agent'] ?? '') && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><div id="app"></div></body></html>');
      return true;
    }
  });
  const report = await checkBotAccess(base);
  const row = report.rows.find((r) => r.bot === 'OAI-SearchBot');
  assert.ok(row.failure);
  assert.ok(row.problems.some((p) => /h1|JSON-LD|bytes/.test(p)));
});

// ---- log analysis ----

const sample = await readFile(path.join(ROOT, 'test/fixtures/access.sample.log'), 'utf8');

test('log lines parse', () => {
  const r = parseLine('1.2.3.4 - - [26/Oct/2026:09:00:01 +0000] "GET /x HTTP/1.1" 404 12 "-" "UA/1"');
  assert.deepEqual([r.ip, r.path, r.status, r.bytes, r.userAgent], ['1.2.3.4', '/x', 404, 12, 'UA/1']);
  assert.equal(parseLine('garbage'), null);
});

test('log analysis separates bots from browsers and flags retrieval bots getting errors', () => {
  const result = analyzeLog(sample);
  assert.equal(result.totals.requests, 23);
  assert.equal(result.totals.human, 3);
  assert.equal(result.totals.otherBots, 1);
  const flagged = result.alerts.map((a) => a.bot).sort();
  assert.deepEqual(flagged, ['Bingbot', 'PerplexityBot']);
  assert.ok(result.neverSeen.includes('Claude-User'));
});

test('training bots with errors are not raised as alerts', () => {
  const line = '1.1.1.1 - - [26/Oct/2026:09:00:01 +0000] "GET /x HTTP/1.1" 403 1 "-" "Mozilla/5.0 (compatible; GPTBot/1.1)"';
  assert.deepEqual(analyzeLog(line).alerts, []);
});
