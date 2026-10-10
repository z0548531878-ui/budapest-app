// A tiny static server for the tests: serves index.html from the repo root.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..');
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '') || 'index.html';
  try {
    const body = await readFile(join(root, path.includes('..') ? 'index.html' : path));
    res.writeHead(200, { 'content-type': path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(4173);
