// CLI for the build-time validator.
//   node scripts/validate.mjs [--strict] [--json] [--summary] [--dist dir] [--site-url url] [--fail-on-warn]
// Exit code 1 when any error is found (or any warning with --fail-on-warn).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDist, formatText, formatMarkdown } from '../src/schema/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

try {
  const result = await validateDist({
    rootDir: ROOT,
    distDir: value('--dist') ? path.resolve(value('--dist')) : undefined,
    siteUrl: value('--site-url'),
    strict: flag('--strict'),
  });

  if (flag('--json')) console.log(JSON.stringify(result, null, 2));
  else if (flag('--summary')) console.log(formatMarkdown(result));
  else console.log(formatText(result));

  const failed = result.totals.errors > 0 || (flag('--fail-on-warn') && result.totals.warnings > 0);
  process.exit(failed ? 1 : 0);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
