import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const b2id = fs.readFileSync('/home/sandbox/.vault/backblaze-b2-read-only-key-oncehere-archive-bucket-ae31de/username','utf8').trim();
const b2k = fs.readFileSync('/home/sandbox/.vault/backblaze-b2-read-only-key-oncehere-archive-bucket-ae31de/password','utf8').trim();
const authJ = await (await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account',
  { headers:{ Authorization:'Basic '+Buffer.from(b2id+':'+b2k).toString('base64') } })).json();
const s = authJ.apiInfo.storageApi;
const objects = JSON.parse(fs.readFileSync('/tmp/b2-claretines-objects.json','utf8'));
fs.mkdirSync('/tmp/claretines-media', { recursive: true });
const manifest = [];
let done = 0, failed = [];
for (const o of objects) {
  const url = s.downloadUrl + '/file/oncehere-media-gbaruah21-2026/' + o.name.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(url, { headers: { Authorization: authJ.authorizationToken } });
  if (!r.ok) { failed.push({ name: o.name, status: r.status }); console.log('FAIL', r.status, o.name); continue; }
  const buf = Buffer.from(await r.arrayBuffer());
  const dest = path.join('/tmp/claretines-media', o.name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  manifest.push({ name: o.name, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), b2FileId: o.fileId, b2Size: o.size, sizeMatch: buf.length === o.size });
  done++;
  if (done % 40 === 0) console.log('progress:', done + '/' + objects.length);
}
fs.writeFileSync('/tmp/claretines-media-manifest.json', JSON.stringify({ archive: 'arc-1789463778317-nli43', copiedAt: new Date().toISOString(), fileCount: manifest.length, totalBytes: manifest.reduce((a,m)=>a+m.bytes,0), failed, files: manifest }, null, 1), { mode: 0o600 });
console.log('DONE:', done, 'of', objects.length, '| failed:', failed.length, '| bytes:', manifest.reduce((a,m)=>a+m.bytes,0));
console.log('size mismatches:', manifest.filter(m => !m.sizeMatch).length);
