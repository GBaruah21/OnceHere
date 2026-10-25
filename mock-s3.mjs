// Minimal S3-compatible mock for isolated local testing. Stores objects in memory.
import http from 'node:http';
import fs from 'node:fs';
const objects = new Map();
const PIXEL = Buffer.from('47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b','hex');
 // key -> {body, contentType}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const parts = u.pathname.split('/').filter(Boolean); // [bucket, ...keyParts]
  const key = decodeURIComponent(parts.slice(1).join('/'));
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (u.searchParams.has('cors') && req.method === 'PUT') { res.writeHead(200); return res.end(); }
    if (u.searchParams.has('list-type') && req.method === 'GET') {
      const keys = [...objects.keys()];
      const xml = `<?xml version="1.0"?><ListBucketResult><KeyCount>${keys.length}</KeyCount>${keys.map(k=>`<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`;
      res.writeHead(200, {'Content-Type':'application/xml'}); return res.end(xml);
    }
    if (!key) { res.writeHead(400); return res.end(); }
    if (req.method === 'PUT') { objects.set(key, {body, contentType: req.headers['content-type']||'application/octet-stream'}); res.writeHead(200, {ETag: '"mock"'}); return res.end(); }
    if (req.method === 'HEAD') { const o = objects.get(key) || {body: PIXEL, contentType: 'image/gif'}; res.writeHead(200, {'Content-Length': o.body.length, 'Content-Type': o.contentType, 'Cache-Control': 'public, max-age=86400'}); return res.end(); }
    if (req.method === 'GET') { const o = objects.get(key) || {body: PIXEL, contentType: 'image/gif'}; res.writeHead(200, {'Content-Type': o.contentType, 'Cache-Control': 'public, max-age=86400'}); return res.end(o.body); }
    if (req.method === 'DELETE') {
      if (fs.existsSync('/tmp/mock-s3-fail-delete')) { res.writeHead(503); return res.end('injected delete failure'); }
      objects.delete(key); res.writeHead(204); return res.end();
    }
    res.writeHead(405); res.end();
  });
});
server.listen(3999, '127.0.0.1', () => console.log('mock-s3 on 3999'));
