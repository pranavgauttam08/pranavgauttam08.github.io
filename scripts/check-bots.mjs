// Usage: node scripts/check-bots.mjs --url https://your-site.example [--path /writing/x/] [--json]
// Exits 1 when a bot that robots.txt allows is served a degraded page.

import { checkBotAccess, formatAccessReport } from '../src/crawl/check-access.mjs';

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const url = value('--url');
if (!url) {
  console.error('Usage: node scripts/check-bots.mjs --url https://your-site.example [--path /page/] [--json]');
  process.exit(2);
}

const report = await checkBotAccess(url, { pagePath: value('--path') ?? '/' });
console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatAccessReport(report));
process.exit(report.failures ? 1 : 0);
