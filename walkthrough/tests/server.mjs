/* Minimal static server for tests: serves walkthrough/dist and applies the rules in
 * dist/_headers the way Netlify does (path patterns with a trailing *), so the
 * Content-Security-Policy and framing headers are exercised locally. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function parseHeaders(file) {
  const rules = [];
  let cur = null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { cur = { path: line.trim(), headers: [] }; rules.push(cur); continue; }
    const i = line.indexOf(':');
    cur.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return rules;
}
const matches = (pattern, path) => (pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern);

export function serve(root, { port = 0, extraHeaders = null } = {}) {
  const dir = resolve(root);
  const rules = existsSync(join(dir, '_headers')) ? parseHeaders(join(dir, '_headers')) : [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    let file = normalize(join(dir, path));
    if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); return; }
    const headers = { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' };
    for (const r of rules) if (matches(r.path, path)) for (const [k, v] of r.headers) headers[k.toLowerCase()] = v;
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders(path) || {})) headers[k.toLowerCase()] = v;
    res.writeHead(200, headers);
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((c) => server.close(c)) })));
}
