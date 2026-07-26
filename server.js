'use strict';

// CtrlAI dev server. Node builtins only, no dependencies, no build step.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;

const PAGE_ROUTES = {
  '/': 'index.html',
  '/memory-garden': 'games/memory-garden/index.html',
  '/mahjong-kakis': 'games/mahjong-kakis/index.html',
  '/scam-dojo': 'games/scam-dojo/index.html'
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

// Resolve a URL path to an absolute file path that is provably inside ROOT.
// Returns null for traversal attempts, dotfiles, and undecodable paths.
function resolveInsideRoot(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (err) {
    return null;
  }
  if (decoded.indexOf('\0') !== -1) {
    return null;
  }
  const relative = decoded.replace(/^\/+/, '');
  const segments = relative.split('/');
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i].charAt(0) === '.' && segments[i] !== '') {
      return null;
    }
  }
  const absolute = path.resolve(ROOT, relative);
  if (absolute !== ROOT && absolute.indexOf(ROOT + path.sep) !== 0) {
    return null;
  }
  return absolute;
}

function sendNotFound(res) {
  const body = 'Not found';
  res.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, absolute, method) {
  fs.readFile(absolute, function (err, data) {
    if (err) {
      sendNotFound(res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypeFor(absolute),
      'Cache-Control': 'no-store',
      'Content-Length': data.length
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(data);
  });
}

const server = http.createServer(function (req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('Method not allowed');
    return;
  }

  const requested = req.url.split('?')[0].split('#')[0];
  const trimmed = requested.length > 1 ? requested.replace(/\/+$/, '') : requested;
  const routeKey = trimmed === '' ? '/' : trimmed;

  if (Object.prototype.hasOwnProperty.call(PAGE_ROUTES, routeKey)) {
    sendFile(res, path.join(ROOT, PAGE_ROUTES[routeKey]), req.method);
    return;
  }

  const absolute = resolveInsideRoot(routeKey);
  if (absolute === null) {
    sendNotFound(res);
    return;
  }

  fs.stat(absolute, function (err, stats) {
    if (err) {
      sendNotFound(res);
      return;
    }
    if (stats.isDirectory()) {
      sendFile(res, path.join(absolute, 'index.html'), req.method);
      return;
    }
    sendFile(res, absolute, req.method);
  });
});

server.listen(PORT, function () {
  process.stdout.write('CtrlAI dev server running at http://localhost:' + PORT + '\n');
});
