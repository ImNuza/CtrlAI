'use strict';

// CtrlAI dev server. Node builtins only, no dependencies, no build step.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;

/* The shipping app lives in app/, which is also the deploy root on EdgeOne
   Pages. /garden-of-life is kept pointing at it so older links and QA scripts
   written against the previous layout still land somewhere real. */
const PAGE_ROUTES = {
  '/': 'index.html',
  '/app': 'app/index.html',
  '/garden-of-life': 'app/index.html',
  '/archive/memory-garden': 'archive/memory-garden/index.html',
  '/archive/mahjong-kakis': 'archive/mahjong-kakis/index.html',
  '/archive/scam-dojo': 'archive/scam-dojo/index.html'
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

/* A browser closing a tab, or a test runner closing a context, resets the socket
   while a response is still going out. Node reports that on the request or the
   response stream, and an 'error' event nobody listens for takes the process
   down. A client walking away is never the server's problem. */
const DROPPED_CLIENT = ['ECONNRESET', 'EPIPE', 'ECANCELED', 'ERR_STREAM_DESTROYED',
  'ERR_STREAM_WRITE_AFTER_END'];

function isDroppedClient(err) {
  return Boolean(err) && DROPPED_CLIENT.indexOf(err.code) !== -1;
}

/* Anything fatal goes out with a synchronous write. A piped stderr is async, so
   process.exit can cut the message off halfway, and the QA harness reading that
   pipe is precisely who needs to read it. */
function fatal(message) {
  fs.writeSync(2, message + '\n');
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
    // The read takes a moment, and the client can be long gone by the time it
    // lands. Writing to a dead response earns nothing but an error event.
    if (res.writableEnded || res.destroyed) {
      return;
    }
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
  req.on('error', function () { /* the client left, nothing to answer */ });
  res.on('error', function (err) {
    if (!isDroppedClient(err)) {
      fatal('CtrlAI dev server response error: ' + (err.stack || err));
    }
  });

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

// Garbage on the wire, or a socket that dies before the request is whole. Answer
// if the socket can still hear us, then close it either way.
server.on('clientError', function (err, socket) {
  if (!socket.destroyed && socket.writable && !isDroppedClient(err)) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  }
  socket.destroy();
});

server.on('connection', function (socket) {
  socket.on('error', function () { /* resets are routine, let the socket go */ });
});

/* Refusing to start has to be loud. This used to be an unhandled 'error' event,
   and when a QA harness spawned the server with its output ignored, the harness
   then talked to whatever was already on the port and reported nothing at all
   until that stranger went away mid run. */
server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    fatal('CtrlAI dev server cannot start: port ' + PORT + ' is already in use. ' +
      'Find the holder with "lsof -nP -iTCP:' + PORT + ' -sTCP:LISTEN", stop it, ' +
      'or start this server with a free PORT.');
  } else {
    fatal('CtrlAI dev server failed to start: ' + (err.stack || err));
  }
  process.exitCode = 1;
  server.close();
});

/* Last line of defence, deliberately narrow. Swallowing everything would hide
   the next real fault the same way the last one hid, so only a client that
   vanished mid write is survivable and everything else still ends the process. */
process.on('uncaughtException', function (err) {
  if (isDroppedClient(err)) {
    return;
  }
  fatal('CtrlAI dev server crashed: ' + (err.stack || err));
  process.exit(1);
});

server.listen(PORT, function () {
  process.stdout.write('CtrlAI dev server running at http://localhost:' + PORT + '\n');
});
