// SYNTHETIC lost-access recovery proof (break-glass path):
// An operator holding ONLY the sealed durable snapshot restores the archive
// into an empty store, writing a FRESH recovery-key hash at restore time.
// A brand-new server (fresh SESSION_SECRET, so all old sessions die) must
// then issue a working owner session via the REAL key-access endpoint with
// the new key; old key / wrong key / old session must be denied; all
// non-auth fixture fields must be unchanged.
// All secrets are disposable synthetics generated at runtime. No real data.
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash, randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';

const DIR = '/tmp/rec-bootstrap', DB_A = `${DIR}/a.db`, DB_B = `${DIR}/b.db`;
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = { 'Content-Type': 'application/json' };
let passed = 0, failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' ' + d}`); ok ? passed++ : failed++; };

async function initDb(p) {
  const c = createClient({ url: `file:${p}`, authToken: 'x' });
  await c.execute('PRAGMA journal_mode = WAL');
  await c.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
  c.close();
}
function startServer(port, db, secret, log) {
  const srv = spawn('npx', ['tsx', 'server.ts', '--port', String(port)], {
    cwd: '/tmp/oncehere-scan',
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port),
      TURSO_DATABASE_URL: `file:${db}`, TURSO_AUTH_TOKEN: 'x', SESSION_SECRET: secret,
      OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999', OBJECT_STORAGE_BUCKET: 'rb-bucket',
      OBJECT_STORAGE_ACCESS_KEY_ID: 'x', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'y',
      OBJECT_STORAGE_REGION: 'auto', OBJECT_STORAGE_FORCE_PATH_STYLE: 'true' },
    stdio: ['ignore', fs.openSync(log, 'w'), 'inherit'],
  });
  process.on('exit', () => { try { srv.kill('SIGKILL'); } catch {} });
  return srv;
}
async function waitUp(port) {
  for (let i = 0; i < 160; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/api/archives`); if (r.status === 200) return true; } catch {} await sleep(500); }
  return false;
}
const decodeRow = (data) => {
  const s = JSON.parse(String(data));
  return JSON.parse((s.compression === 'gzip' ? gunzipSync(Buffer.from(s.chunks.join(''), 'base64')) : Buffer.from(s.chunks.join(''), 'base64')).toString('utf8'));
};
// Preserve the original envelope (numeric format marker etc.); replace only
// the payload chunks and their digest.
const encodeRow = (snap, originalData) => {
  const env = JSON.parse(String(originalData));
  const json = JSON.stringify(snap);
  env.chunks = [gzipSync(Buffer.from(json, 'utf8')).toString('base64')];
  env.sha256 = createHash('sha256').update(json).digest('hex');
  return JSON.stringify(env);
};

// ---------- Phase 1: synthetic archive on server A (the "before loss" world) ----------
await initDb(DB_A);
const srvA = startServer(3021, DB_A, 'secret-OLD-' + randomBytes(6).toString('hex'), `${DIR}/srvA.log`);
if (!await waitUp(3021)) { console.log('server A never came up'); process.exit(1); }
const A = 'http://127.0.0.1:3021/api';
const OLD_KEY = 'OLDKEY-synthetic-' + randomBytes(4).toString('hex');
const created = await (await fetch(`${A}/archives`, { method: 'POST', headers: J, body: JSON.stringify({
  archiveType: 'school', title: 'Bootstrap Fixture', organizationName: 'QA', subtitle: 'fixture-subtitle',
  startYear: 2022, endYear: 2026, themeId: 'midnight-cinema', visibility: 'unlisted',
  contributionMode: 'owner-only', recoveryKey: OLD_KEY }) })).json();
if (!created.archive) { console.log('CREATE FAILED', JSON.stringify(created).slice(0, 200)); process.exit(1); }
const id = created.archive.id;
const H_A = { ...J, Authorization: `Bearer ${created.ownerToken}` };
await fetch(`${A}/archives/${id}/timeline`, { method: 'POST', headers: H_A, body: JSON.stringify({ title: 'Fixture event', description: 'fixture description', yearLabel: '2024' }) });
await fetch(`${A}/archives/${id}/members`, { method: 'POST', headers: H_A, body: JSON.stringify({ name: 'Fixture Person' }) });
await fetch(`${A}/archives/${id}/wall`, { method: 'POST', headers: H_A, body: JSON.stringify({ text: 'fixture note', authorName: 'QA' }) });
// A real "old world" owner session, minted by the real endpoint with the OLD key:
const oldLogin = await (await fetch(`${A}/archives/auth/key-access`, { method: 'POST', headers: J, body: JSON.stringify({ key: OLD_KEY }) })).json();
check('old world: key-access with original key worked', oldLogin.success === true && !!oldLogin.token);
const OLD_TOKEN = oldLogin.token;
await sleep(1500); // let everything persist

// ---------- Phase 2: seal the snapshot fixture (operator backup artifact) ----------
const dbcA = createClient({ url: `file:${DB_A}`, authToken: 'x' });
const rows = await dbcA.execute({ sql: 'SELECT id, data FROM oncehere_state WHERE id IN (?, ?)', args: [`tenant-${id}`, 'tenant-index'] });
dbcA.close();
check('fixture rows captured (tenant + index)', rows.rows.length === 2, `got ${rows.rows.length}`);
const fixture = { rows: rows.rows.map((r) => ({ id: String(r.id), data: String(r.data) })) };
const PASS = 'synthetic-pass-' + randomBytes(6).toString('hex');
const salt = randomBytes(16), nonce = randomBytes(12);
const sealKey = scryptSync(PASS, salt, 32);
const cipher = createCipheriv('aes-256-gcm', sealKey, nonce);
const sealed = Buffer.concat([cipher.update(JSON.stringify(fixture), 'utf8'), cipher.final()]);
const artifact = Buffer.concat([Buffer.from('OHAEAD1\n'), salt, nonce, cipher.getAuthTag(), sealed]);
fs.writeFileSync(`${DIR}/fixture.oheaad`, artifact);
srvA.kill('SIGKILL');
await sleep(500);

// ---------- Phase 3: break-glass restore into an empty store ----------
const raw = fs.readFileSync(`${DIR}/fixture.oheaad`);
const header = raw.subarray(0, 8).toString('utf8');
const rSalt = raw.subarray(8, 24), rNonce = raw.subarray(24, 36), rTag = raw.subarray(36, 52), rBody = raw.subarray(52);
const decipher = createDecipheriv('aes-256-gcm', scryptSync(PASS, rSalt, 32), rNonce);
decipher.setAuthTag(rTag);
const restoredFixture = JSON.parse(Buffer.concat([decipher.update(rBody), decipher.final()]).toString('utf8'));
check('sealed fixture authenticated + opened (AEAD)', header === 'OHAEAD1\n' && Array.isArray(restoredFixture.rows));

// Fresh operator-chosen key, generated at restore time, never logged:
const NEW_KEY = 'NEWKEY-synthetic-' + randomBytes(8).toString('hex');
const newHash = bcrypt.hashSync(NEW_KEY, 10);
const tenantRow = restoredFixture.rows.find((r) => r.id === `tenant-${id}`);
const snap = decodeRow(tenantRow.data);
const originalSnap = JSON.parse(JSON.stringify(snap));
snap.archive.recoveryKeyHash = newHash;
const freshToken = () => `${new Date().toISOString()}#restore-${randomBytes(6).toString('hex')}`;
await initDb(DB_B);
const dbcB = createClient({ url: `file:${DB_B}`, authToken: 'x' });
for (const row of restoredFixture.rows) {
  const data = row.id === `tenant-${id}` ? encodeRow(snap, row.data) : row.data;
  await dbcB.execute({ sql: 'INSERT INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)', args: [row.id, data, freshToken()] });
}
// Compare restore fidelity BEFORE any post-restore writes: everything except
// the deliberately replaced recoveryKeyHash must be identical to the fixture.
const verify = await dbcB.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
const restoredSnap = decodeRow(verify.rows[0].data);
dbcB.close();
const strip = (s) => { const c = JSON.parse(JSON.stringify(s)); delete c.archive.recoveryKeyHash; return c; };
check('all non-auth fixture fields unchanged by restore', JSON.stringify(strip(restoredSnap)) === JSON.stringify(strip(originalSnap)));

// ---------- Phase 4: fresh server, fresh secret; real endpoint login ----------
const srvB = startServer(3022, DB_B, 'secret-NEW-' + randomBytes(6).toString('hex'), `${DIR}/srvB.log`);
if (!await waitUp(3022)) { console.log('server B never came up'); process.exit(1); }
const B = 'http://127.0.0.1:3022/api';

const oldKeyLogin = await fetch(`${B}/archives/auth/key-access`, { method: 'POST', headers: J, body: JSON.stringify({ key: OLD_KEY }) });
check('old key denied after restore', oldKeyLogin.status === 401, `got ${oldKeyLogin.status}`);
const wrongLogin = await fetch(`${B}/archives/auth/key-access`, { method: 'POST', headers: J, body: JSON.stringify({ key: 'completely-wrong-key' }) });
check('wrong key denied', wrongLogin.status === 401, `got ${wrongLogin.status}`);
const oldSessionRead = await fetch(`${B}/archives/${id}`, { headers: { Authorization: `Bearer ${OLD_TOKEN}` } });
check('pre-loss session token rejected (fresh secret)', [401, 403].includes(oldSessionRead.status), `got ${oldSessionRead.status}`);

const login = await fetch(`${B}/archives/auth/key-access`, { method: 'POST', headers: J, body: JSON.stringify({ key: NEW_KEY }) });
const loginBody = await login.json().catch(() => ({}));
check('REAL key-access login with restore-time key issues owner session', login.status === 200 && loginBody.success === true && loginBody.keyKind === 'master', `got ${login.status} ${JSON.stringify(loginBody).slice(0, 120)}`);
const T2 = loginBody.token;
const H_B = { ...J, Authorization: `Bearer ${T2}` };
const read = await fetch(`${B}/archives/${id}`, { headers: { Authorization: `Bearer ${T2}` } });
check('authorized read with recovered session', read.status === 200, `got ${read.status}`);
const readBody = await read.json();
const patch = await fetch(`${B}/archives/${id}`, { method: 'PATCH', headers: H_B,
  body: JSON.stringify({ subtitle: 'recovered-edit', baseVersion: readBody.archive.saveVersion }) });
check('authorized WRITE with recovered session', patch.status === 200, `got ${patch.status} ${JSON.stringify(await patch.clone().json().catch(() => null)).slice(0, 140)}`);

console.log(`recovery-bootstrap: ${passed} passed, ${failed} failed`);
srvB.kill('SIGKILL');
process.exit(failed ? 1 : 0);
