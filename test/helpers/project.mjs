// Test helper: copy the project to a temp directory, optionally make the config "real",
// and build it there, so mutation tests never touch the working tree.
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../scripts/build.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SITE_URL = 'https://pranavgauttam08.github.io';

export async function makeProject({ realConfig = true, mutateConfig } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'site-test-'));
  for (const name of ['content', 'public', 'site.config.json', 'package.json']) {
    await cp(path.join(ROOT, name), path.join(dir, name), { recursive: true });
  }
  const configPath = path.join(dir, 'site.config.json');
  let text = await readFile(configPath, 'utf8');
  // The shipped config is real; an "unreal" one re-creates the placeholder state a fresh template has.
  if (!realConfig) text = text.replace('/in/pranavgauttam', '/in/REPLACE_ME');
  if (mutateConfig) {
    const config = JSON.parse(text);
    mutateConfig(config);
    text = JSON.stringify(config, null, 2);
  }
  await writeFile(configPath, text);
  const dist = path.join(dir, 'dist');
  await build({ rootDir: dir, outDir: dist, siteUrl: SITE_URL, log: () => {} });
  return { dir, dist, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export const read = (file) => readFile(file, 'utf8');
export const write = (file, text) => writeFile(file, text);
export const page = (project, urlPath) =>
  path.join(project.dist, urlPath === '/' ? '' : urlPath, 'index.html');
