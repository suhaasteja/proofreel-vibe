import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3456;

// In-memory store
let items = [];
let nextId = 1;

function serveStatic(res, filePath, contentType) {
  const fullPath = path.join(__dirname, filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Serve the HTML page
  if (url.pathname === '/' && req.method === 'GET') {
    serveStatic(res, 'index.html', 'text/html');
    return;
  }

  // API: List items
  if (url.pathname === '/api/items' && req.method === 'GET') {
    json(res, items);
    return;
  }

  // API: Create item
  if (url.pathname === '/api/items' && req.method === 'POST') {
    const { name } = await parseBody(req);
    if (!name) { json(res, { error: 'name required' }, 400); return; }
    const item = { id: nextId++, name };
    items.push(item);
    json(res, item, 201);
    return;
  }

  // API: Update item
  if (url.pathname.startsWith('/api/items/') && req.method === 'PUT') {
    const id = parseInt(url.pathname.split('/').pop());
    const { name } = await parseBody(req);
    const item = items.find(i => i.id === id);
    if (!item) { json(res, { error: 'not found' }, 404); return; }
    item.name = name;
    json(res, item);
    return;
  }

  // API: Delete item
  if (url.pathname.startsWith('/api/items/') && req.method === 'DELETE') {
    const id = parseInt(url.pathname.split('/').pop());
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) { json(res, { error: 'not found' }, 404); return; }
    items.splice(idx, 1);
    json(res, { ok: true });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Toy CRUD app running at http://localhost:${PORT}`);
});
