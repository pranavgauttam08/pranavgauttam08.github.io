// Usage: node scripts/analyze-logs.mjs access.log [--json]
// Reads an Apache/nginx combined-format access log and reports how search and AI bots were served.

import { readFile } from 'node:fs/promises';
import { analyzeLog, formatLogReport } from '../src/crawl/logs.mjs';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
if (!file) {
  console.error('Usage: node scripts/analyze-logs.mjs access.log [--json]');
  process.exit(2);
}

const result = analyzeLog(await readFile(file, 'utf8'));
console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : formatLogReport(result));
process.exit(result.alerts.length ? 1 : 0);
