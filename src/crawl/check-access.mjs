// "Can each bot actually read my page?" robots.txt only states intent. This fetches the page the
// way each bot would announce itself and compares what comes back with what a browser gets.
//
// Limit: a request that merely carries a bot's name cannot reproduce rules that verify a bot by
// its IP address. A clean result is a good sign, not proof. Server logs settle it (see logs.mjs).

import { BOTS, simulatedUserAgent } from './bots.mjs';
import { parseRobots, canFetch } from './robots-parse.mjs';

export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function snapshot(fetchImpl, url, userAgent) {
  try {
    const response = await fetchImpl(url, { headers: { 'user-agent': userAgent, accept: 'text/html,*/*' }, redirect: 'follow' });
    const body = await response.text();
    return {
      status: response.status,
      bytes: Buffer.byteLength(body),
      hasH1: /<h1\b/i.test(body),
      hasJsonLd: /application\/ld\+json/i.test(body),
      text: body,
    };
  } catch (error) {
    return { status: 0, bytes: 0, hasH1: false, hasJsonLd: false, text: '', error: error.message };
  }
}

/**
 * @param {string} baseUrl site origin, e.g. https://example.github.io
 * @param {{ fetchImpl?: typeof fetch, bots?: object[], pagePath?: string }} [options]
 */
export async function checkBotAccess(baseUrl, { fetchImpl = fetch, bots, pagePath = '/' } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  const targets = bots ?? BOTS.filter((bot) => !bot.robotsOnly);

  const browser = await snapshot(fetchImpl, `${base}${pagePath}`, BROWSER_UA);
  const robots = await snapshot(fetchImpl, `${base}/robots.txt`, BROWSER_UA);
  const parsed = robots.status === 200 ? parseRobots(robots.text) : { groups: [], sitemaps: [] };

  const rows = [];
  for (const bot of targets) {
    const allowedByRobots = canFetch(parsed, bot.token, pagePath);
    const result = await snapshot(fetchImpl, `${base}${pagePath}`, simulatedUserAgent(bot));
    const problems = [];
    if (result.error) problems.push(`request failed: ${result.error}`);
    else if (result.status !== browser.status) problems.push(`HTTP ${result.status} (browser got ${browser.status})`);
    else if (browser.bytes && result.bytes < browser.bytes * 0.5) {
      problems.push(`${result.bytes} bytes (browser got ${browser.bytes})`);
    }
    if (!result.error && browser.hasH1 && !result.hasH1) problems.push('no <h1> in response');
    if (!result.error && browser.hasJsonLd && !result.hasJsonLd) problems.push('no JSON-LD in response');

    rows.push({
      bot: bot.token,
      purpose: bot.purpose,
      allowedByRobots,
      status: result.status,
      bytes: result.bytes,
      hasH1: result.hasH1,
      hasJsonLd: result.hasJsonLd,
      problems,
      // A degraded response is only a failure when robots.txt says the bot is welcome.
      failure: allowedByRobots && problems.length > 0,
    });
  }

  return {
    baseUrl: base,
    pagePath,
    robotsStatus: robots.status,
    browser: { status: browser.status, bytes: browser.bytes, hasH1: browser.hasH1, hasJsonLd: browser.hasJsonLd },
    rows,
    failures: rows.filter((row) => row.failure).length,
  };
}

export function formatAccessReport(report) {
  const lines = [
    `Bot access check for ${report.baseUrl}${report.pagePath}`,
    `Browser: HTTP ${report.browser.status}, ${report.browser.bytes} bytes, h1 ${report.browser.hasH1 ? 'yes' : 'no'}, JSON-LD ${report.browser.hasJsonLd ? 'yes' : 'no'}. robots.txt: HTTP ${report.robotsStatus}.`,
    '',
    ['Bot'.padEnd(18), 'Purpose'.padEnd(11), 'robots.txt'.padEnd(11), 'HTTP'.padEnd(5), 'Bytes'.padEnd(8), 'h1'.padEnd(4), 'JSON-LD'.padEnd(8), 'Verdict'].join(''),
  ];
  for (const row of report.rows) {
    const verdict = row.failure ? `FAIL: ${row.problems.join('; ')}` : row.allowedByRobots ? 'ok' : 'blocked by robots.txt (by policy)';
    lines.push(
      [
        row.bot.padEnd(18),
        row.purpose.padEnd(11),
        (row.allowedByRobots ? 'allowed' : 'blocked').padEnd(11),
        String(row.status).padEnd(5),
        String(row.bytes).padEnd(8),
        (row.hasH1 ? 'yes' : 'no').padEnd(4),
        (row.hasJsonLd ? 'yes' : 'no').padEnd(8),
        verdict,
      ].join(''),
    );
  }
  lines.push(
    '',
    report.failures
      ? `${report.failures} bot(s) are allowed by robots.txt but received a degraded response.`
      : 'Every bot that robots.txt allows received the same page as a browser.',
    'Note: a simulated user agent cannot reproduce IP-verified rules. Confirm with server logs.',
  );
  return lines.join('\n');
}
