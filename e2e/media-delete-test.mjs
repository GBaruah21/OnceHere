const base = 'http://127.0.0.1:3000';
const created = await (await fetch(base + '/api/archives', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ archiveType: 'school', title: 'DelProto', organizationName: 'QA', startYear: 2022, endYear: 2026,
    themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'open', recoveryKey: 'testkey-del-0001' }) })).json();
const id = created.archive.id; const token = created.ownerToken;
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

async function uploadOne(name) {
  const bytes = Buffer.from('ffd8ffe0' + '00'.repeat(200), 'hex');
  const pre = await (await fetch(base + '/api/archives/' + id + '/media/upload-url', { method: 'POST', headers: H, body: JSON.stringify({ fileName: name + '.jpg', contentType: 'image/jpeg', size: bytes.length, purpose: 'vault' }) })).json();
  const put = await fetch(pre.uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/jpeg' } });
  if (!put.ok) throw new Error('PUT failed ' + put.status);
  const cp = await (await fetch(base + '/api/archives/' + id + '/media/upload-complete', { method: 'POST', headers: H, body: JSON.stringify({ fileName: name + '.jpg', contentType: 'image/jpeg', size: bytes.length, purpose: 'vault', key: pre.key }) })).json();
  const reg = await (await fetch(base + '/api/archives/' + id + '/media', { method: 'POST', headers: H, body: JSON.stringify({ url: cp.url, storageKey: cp.storageKey || pre.key, type: 'image', title: name, contentType: 'image/jpeg', fileSize: bytes.length }) })).json();
  return { mediaId: reg.item?.id, key: pre.key };
}
const mockHas = async (key) => {
  const xml = await (await fetch('http://127.0.0.1:3999/mock-bucket?list-type=2')).text();
  return xml.includes('<Key>' + key + '</Key>');
};

const m1 = await uploadOne('healthy-delete');
const m2 = await uploadOne('failure-delete');
console.log('uploaded:', JSON.stringify({ m1, m2 }));

// 1. healthy delete: metadata + object both gone
const d1 = await fetch(base + '/api/archives/' + id + '/media/' + m1.mediaId, { method: 'DELETE', headers: H });
console.log('healthy delete status:', d1.status);
console.log('  object after healthy delete (expect false):', await mockHas(m1.key));
let mediaJ = await (await fetch(base + '/api/archives/' + id + '/media', { headers: H, cache: 'no-store' })).json();
let arr = mediaJ.items || mediaJ.media || (Array.isArray(mediaJ) ? mediaJ : []);
console.log('  metadata gone:', !arr.some(m => m.id === m1.mediaId));
console.log('C1 healthy delete: object+metadata both removed:', d1.ok && !(await mockHas(m1.key)));

// 2. forced persist failure: make DB read-only, then delete -> expect 503, object RETAINED, metadata intact
const { execSync } = await import('node:child_process');
execSync('chmod 444 /tmp/oncehere-local-test.db');
await new Promise(r => setTimeout(r, 300));
const d2 = await fetch(base + '/api/archives/' + id + '/media/' + m2.mediaId, { method: 'DELETE', headers: H });
const d2body = await d2.json().catch(() => ({}));
console.log('failure delete status (expect 503):', d2.status, JSON.stringify(d2body).slice(0, 90));
console.log('  object RETAINED under persist failure (expect true):', await mockHas(m2.key));
mediaJ = await (await fetch(base + '/api/archives/' + id + '/media', { headers: H, cache: 'no-store' })).json();
arr = mediaJ.items || mediaJ.media || (Array.isArray(mediaJ) ? mediaJ : []);
console.log('  metadata intact after rollback:', arr.some(m => m.id === m2.mediaId));
execSync('chmod 644 /tmp/oncehere-local-test.db');
