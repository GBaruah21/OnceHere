// Deterministic HTTP-level two-process concurrency proof for the tenant CAS.
// Spawns TWO real server processes on one shared file-backed DB and forces a
// refresh->write race via ONCEHERE_TEST_PERSIST_BARRIER_DIR (test-only seam).
// Usage: node e2e/http-race-test.mjs
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
function decodeSnapshotRow(dataJson) {
  const stored = JSON.parse(dataJson);
  const buf = Buffer.from(stored.chunks.join(''), 'base64');
  const json = (stored.compression === 'gzip' ? gunzipSync(buf) : buf).toString('utf8');
  if (createHash('sha256').update(json).digest('hex') !== stored.sha256) throw new Error('snapshot sha mismatch');
  return JSON.parse(json);
}
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = '/tmp/http-race';
const BARRIER = path.join(DIR, 'barrier');
const DB = path.join(DIR, 'race.db');
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(BARRIER, { recursive: true });

const baseEnv = {
  ...process.env,
  NODE_ENV: 'test',
  TURSO_DATABASE_URL: `file:${DB}`,
  SESSION_SECRET: 'race-shared-secret',
  TURSO_AUTH_TOKEN: 'unused-for-file',
  OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999',
  OBJECT_STORAGE_BUCKET: 'race-bucket',
  OBJECT_STORAGE_ACCESS_KEY_ID: 'x',
  OBJECT_STORAGE_SECRET_ACCESS_KEY: 'y',
  OBJECT_STORAGE_REGION: 'auto',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  ONCEHERE_TEST_PERSIST_BARRIER_DIR: BARRIER,
  VITE_DEV_SERVER_URL: '',
};
const procs = [];
function startServer(port, tag) {
  const p = spawn('npx', ['tsx', 'server.ts', '--port', String(port)], {
    cwd: ROOT, env: { ...baseEnv, PORT: String(port), ONCEHERE_TEST_PERSIST_BARRIER_TAG: tag },
    stdio: ['ignore', fs.openSync(path.join(DIR, `srv-${port}.log`), 'w'), 'inherit'],
  });
  procs.push(p);
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp(port, tries = 240) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/archives`); if (r.status < 500) return; } catch {}
    await sleep(500);
  }
  throw new Error(`server ${port} did not start`);
}
function cleanup() { for (const p of procs) { try { p.kill('SIGKILL'); } catch {} } }
process.on('exit', cleanup);

// Pre-create schema + WAL before spawning servers: two processes racing
// CREATE TABLE on a fresh rollback-mode file serialize badly (SQLITE_BUSY).
const pre = createClient({ url: `file:${DB}`, authToken: 'unused-for-file' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();

const A = 3111, B = 3112;
let passed = 0, failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.log(`FAIL ${name} ${extra}`); }
}

try {
  startServer(A, 'A'); startServer(B, 'B');
  await waitUp(A); await waitUp(B);

  // Create archive via A; signed owner token works on both (shared SESSION_SECRET).
  const create = await fetch(`http://127.0.0.1:${A}/api/archives`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      archiveType: 'school', title: 'Race Archive', organizationName: 'Race Org',
      subtitle: 'original', startYear: 2020, endYear: 2024,
      themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'owner-only',
      recoveryKey: 'race-recovery-key-12345',
    }),
  }).then((r) => r.json());
  const id = create.archive?.id || create.id;
  const token = create.ownerToken;
  check('archive created with owner token', !!id && !!token, JSON.stringify(create).slice(0, 200));
  // Cross-instance index visibility is throttled (refreshIndexIfMissing minGapMs=5000
  // from instance start): wait it out so B can discover the archive. The throttle
  // window itself is a recorded finding, not something this test hides.
  await sleep(6500);
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const hold = path.join(BARRIER, `hold-A-${id}`);
  const inside = path.join(BARRIER, `inside-A-${id}`);

  async function patch(port, subtitle) {
    // Faithful client: edits from the state freshly loaded on that instance.
    const g = await fetch(`http://127.0.0.1:${port}/api/archives/${id}`, { headers: auth }).then((r) => r.json());
    const baseVersion = (g.archive || g).saveVersion;
    const r = await fetch(`http://127.0.0.1:${port}/api/archives/${id}`, {
      method: 'PATCH', headers: auth, body: JSON.stringify({ subtitle, baseVersion }),
    });
    return r.status;
  }
  async function getSub(port) {
    const r = await fetch(`http://127.0.0.1:${port}/api/archives/${id}`, { headers: auth });
    const j = await r.json();
    return (j.archive || j).subtitle;
  }

  // TEST 1: edit-vs-edit race. A is held inside its persist; B commits; A must conflict.
  fs.writeFileSync(hold, '1'); fs.rmSync(inside, { force: true });
  const pa = patch(A, 'A-edit');
  for (let i = 0; i < 200 && !fs.existsSync(inside); i++) await sleep(50);
  check('A entered persist race window', fs.existsSync(inside));
  const sb = await patch(B, 'B-edit');
  check('B edit committed (2xx)', sb >= 200 && sb < 300, `got ${sb}`);
  fs.rmSync(hold, { force: true });
  const sa = await pa;
  check('A edit rejected with 409 conflict', sa === 409, `got ${sa}`);
  check('winner visible from A', (await getSub(A)) === 'B-edit');
  check('winner visible from B', (await getSub(B)) === 'B-edit');
  // Independent verification: read the durable row through a THIRD, fresh
  // libSQL connection - not either server's API or in-memory state.
  const independent = createClient({ url: `file:${DB}`, authToken: 'unused-for-file' });
  const durable1 = await independent.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
  const d1 = durable1.rows[0] ? decodeSnapshotRow(String(durable1.rows[0].data)) : null;
  check('independent DB read: durable row is winner (B-edit)', d1?.archive?.subtitle === 'B-edit', JSON.stringify(d1?.archive?.subtitle));

  // TEST 2: delete-vs-edit. Upload media via B, then race A's media DELETE against a B edit.
  const payload = Buffer.alloc(1000, 7); // distinct size vs mock fallback pixel (43B)
  const up = await fetch(`http://127.0.0.1:${B}/api/archives/${id}/media/upload-url`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ fileName: 'race.jpg', contentType: 'image/jpeg', size: payload.length, purpose: 'vault' }),
  }).then((r) => r.json());
  check('upload-url issued', !!up.uploadUrl, JSON.stringify(up).slice(0, 200));
  if (up.uploadUrl) {
    await fetch(up.uploadUrl, { method: 'PUT', body: payload, headers: { 'Content-Type': 'image/jpeg' } });
    const done = await fetch(`http://127.0.0.1:${B}/api/archives/${id}/media/upload-complete`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ key: up.key, fileName: 'race.jpg', contentType: 'image/jpeg', size: payload.length, purpose: 'vault' }),
    });
    const doneJ = await done.json().catch(() => ({}));
    // upload-complete only verifies the object; the client registers the item.
    const reg = await fetch(`http://127.0.0.1:${B}/api/archives/${id}/media`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ url: doneJ.url, storageKey: doneJ.storageKey, type: 'image', contentType: 'image/jpeg', fileSize: payload.length, caption: 'race' }),
    });
    const regJ = await reg.json().catch(() => ({}));
    const archAfterUp = await fetch(`http://127.0.0.1:${B}/api/archives/${id}`, { headers: auth }).then((r) => r.json());
    const mediaId = (archAfterUp.media || []).find((m) => m.storageKey === doneJ.storageKey)?.id;
    check('media registered', reg.status < 300 && !!mediaId, `${reg.status} ${JSON.stringify(regJ).slice(0, 200)}`);
    const headBefore = await fetch(`http://127.0.0.1:3999/race-bucket/${up.key}`, { method: 'HEAD' });
    check('object stored (size 1000)', headBefore.headers.get('content-length') === '1000', headBefore.headers.get('content-length'));

    if (mediaId) {
      fs.writeFileSync(hold, '1'); fs.rmSync(inside, { force: true });
      const pd = fetch(`http://127.0.0.1:${A}/api/archives/${id}/media/${mediaId}`, { method: 'DELETE', headers: auth }).then((r) => r.status);
      for (let i = 0; i < 200 && !fs.existsSync(inside); i++) await sleep(50);
      check('A delete entered persist race window', fs.existsSync(inside));
      const sb2 = await patch(B, 'C-edit');
      check('B edit #2 committed', sb2 >= 200 && sb2 < 300, `got ${sb2}`);
      fs.rmSync(hold, { force: true });
      const sd = await pd;
      check('A delete rejected (409/503, not 2xx)', sd === 409 || sd === 503, `got ${sd}`);
      const getAfter = await fetch(`http://127.0.0.1:3999/race-bucket/${up.key}`);
      const afterBytes = Buffer.from(await getAfter.arrayBuffer());
      check('winning-state bytes NOT removed (exact sha256 match)', sha256(afterBytes) === sha256(payload), `len=${afterBytes.length}`);
      const r = await fetch(`http://127.0.0.1:${B}/api/archives/${id}`, { headers: auth });
      const body = await r.json();
      const arch = body.archive || {};
      const still = (body.media || []).some((m) => m.id === mediaId);
      check('winner state still references media + edit', still && arch.subtitle === 'C-edit', JSON.stringify({ still, sub: arch.subtitle }));
      const durable2 = await independent.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
      const d2 = durable2.rows[0] ? decodeSnapshotRow(String(durable2.rows[0].data)) : null;
      check('independent DB read: durable row keeps media + C-edit', (d2?.mediaItems || []).some((m) => m.id === mediaId) && d2?.archive?.subtitle === 'C-edit', JSON.stringify({ sub: d2?.archive?.subtitle, media: (d2?.mediaItems || []).length }));
    }
  }
} catch (e) {
  failed++; console.log('FAIL harness error:', e.message);
} finally {
  cleanup();
}
console.log(`\nhttp-race: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
