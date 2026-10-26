// Server-log analysis for AI and search bots. Reads the Apache/nginx "combined" format:
//   ip - - [time] "METHOD /path HTTP/1.1" status bytes "referer" "user-agent"

import { BOTS, PURPOSES, classifyUserAgent } from './bots.mjs';

const LINE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) (\S+) "([^"]*)" "([^"]*)"/;
const GENERIC_BOT = /bot|crawler|spider|scrapy|fetcher/i;

export function parseLine(line) {
  const match = line.match(LINE);
  if (!match) return null;
  const [, ip, time, method, path, status, bytes, referer, userAgent] = match;
  return { ip, time, method, path, status: Number(status), bytes: bytes === '-' ? 0 : Number(bytes), referer, userAgent };
}

const statusClass = (status) => `${Math.floor(status / 100)}xx`;

/** @param {string} text contents of an access log */
export function analyzeLog(text) {
  const bots = new Map();
  let total = 0;
  let unparsed = 0;
  let human = 0;
  const otherBots = new Map();

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.startsWith('#')) continue;
    const record = parseLine(raw);
    if (!record) {
      unparsed += 1;
      continue;
    }
    total += 1;
    const bot = classifyUserAgent(record.userAgent);
    if (!bot) {
      if (GENERIC_BOT.test(record.userAgent)) {
        const name = record.userAgent.match(/([A-Za-z][\w-]*(?:bot|spider|crawler))/i)?.[1] ?? 'unknown-bot';
        otherBots.set(name, (otherBots.get(name) ?? 0) + 1);
      } else {
        human += 1;
      }
      continue;
    }
    const entry = bots.get(bot.token) ?? {
      token: bot.token,
      operator: bot.operator,
      purpose: bot.purpose,
      requests: 0,
      statuses: {},
      paths: new Map(),
      errorPaths: new Map(),
    };
    entry.requests += 1;
    entry.statuses[statusClass(record.status)] = (entry.statuses[statusClass(record.status)] ?? 0) + 1;
    entry.paths.set(record.path, (entry.paths.get(record.path) ?? 0) + 1);
    if (record.status >= 400) entry.errorPaths.set(record.path, record.status);
    bots.set(bot.token, entry);
  }

  const rows = [...bots.values()]
    .map((entry) => ({
      token: entry.token,
      operator: entry.operator,
      purpose: entry.purpose,
      requests: entry.requests,
      statuses: entry.statuses,
      topPaths: [...entry.paths].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => ({ path: p, requests: n })),
      errorPaths: [...entry.errorPaths].map(([p, status]) => ({ path: p, status })),
    }))
    .sort((a, b) => b.requests - a.requests);

  // A retrieval bot that is getting errors is the finding that matters most: it cannot cite what it cannot read.
  const alerts = rows
    .filter((row) => ['search', 'user-fetch', 'engine'].includes(row.purpose))
    .filter((row) => (row.statuses['4xx'] ?? 0) + (row.statuses['5xx'] ?? 0) > 0)
    .map((row) => ({
      bot: row.token,
      message: `${row.token} (${PURPOSES[row.purpose].title.toLowerCase()}) received ${(row.statuses['4xx'] ?? 0) + (row.statuses['5xx'] ?? 0)} error response(s), e.g. ${row.errorPaths[0].status} on ${row.errorPaths[0].path}.`,
    }));

  const neverSeen = BOTS.filter((b) => !b.robotsOnly && !bots.has(b.token) && b.purpose !== 'engine').map((b) => b.token);
  return {
    totals: { requests: total, unparsed, human, knownBots: rows.reduce((s, r) => s + r.requests, 0), otherBots: [...otherBots.values()].reduce((s, n) => s + n, 0) },
    bots: rows,
    otherBots: [...otherBots].sort((a, b) => b[1] - a[1]).map(([name, requests]) => ({ name, requests })),
    alerts,
    neverSeen,
  };
}

export function formatLogReport(result) {
  const t = result.totals;
  const lines = [
    `${t.requests} requests: ${t.knownBots} from known search and AI bots, ${t.otherBots} from other bots, ${t.human} from browsers${t.unparsed ? `, ${t.unparsed} lines could not be parsed` : ''}.`,
    '',
    ['Bot'.padEnd(18), 'Purpose'.padEnd(11), 'Requests'.padEnd(10), '2xx'.padEnd(6), '3xx'.padEnd(6), '4xx'.padEnd(6), '5xx'.padEnd(6), 'Most-fetched path'].join(''),
  ];
  for (const row of result.bots) {
    lines.push(
      [
        row.token.padEnd(18),
        row.purpose.padEnd(11),
        String(row.requests).padEnd(10),
        String(row.statuses['2xx'] ?? 0).padEnd(6),
        String(row.statuses['3xx'] ?? 0).padEnd(6),
        String(row.statuses['4xx'] ?? 0).padEnd(6),
        String(row.statuses['5xx'] ?? 0).padEnd(6),
        row.topPaths[0]?.path ?? '',
      ].join(''),
    );
  }
  if (result.otherBots.length) lines.push('', `Other bots: ${result.otherBots.map((b) => `${b.name} (${b.requests})`).join(', ')}`);
  if (result.alerts.length) lines.push('', 'Needs attention:', ...result.alerts.map((a) => `  - ${a.message}`));
  if (result.neverSeen.length) lines.push('', `Not seen in this log: ${result.neverSeen.join(', ')}`);
  return lines.join('\n');
}
