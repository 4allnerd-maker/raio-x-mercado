const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 5173;
const root = __dirname;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

http.createServer((req, res) => {
  let file = req.url === '/' ? '/index.html' : req.url;
  file = decodeURIComponent(file.split('?')[0]);
  const candidates = [path.join(root, file), path.join(root, 'data', file)];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) { res.writeHead(404); res.end('not found'); return; }
  fs.readFile(found, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(found);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('listening on ' + port));
