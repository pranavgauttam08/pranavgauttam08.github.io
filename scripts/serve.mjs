// Tiny static file server for previewing dist/ locally. `npm run dev` builds then serves.
// Behaves like GitHub Pages: /dir/ serves /dir/index.html, unknown paths serve 404.html with a 404 status.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

async function resolveFile(dir, urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let target = path.join(dir, clean);
  if (!target.startsWith(dir)) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, 'index.html');
    await stat(target);
    return target;
  } catch {
    return null;
  }
}

/**
 * @param {string} dir directory to serve
 * @param {{ port?: number, handler?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean | void }} [options]
 *   handler runs first; return true to say it handled the request (used by tests to simulate a firewall).
 */
export function createServer(dir, { handler } = {}) {
  return http.createServer(async (req, res) => {
    if (handler?.(req, res) === true) return;
    const { pathname } = new URL(req.url, 'http://localhost');
    const file = await resolveFile(dir, pathname);
    const target = file ?? path.join(dir, '404.html');
    try {
      const body = await readFile(target);
      res.writeHead(file ? 200 : 404, { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 4173);
  const dir = path.join(ROOT, 'dist');
  createServer(dir).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));
}
