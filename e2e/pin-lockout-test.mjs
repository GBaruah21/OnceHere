// Durable PIN/recovery limiting proof over real full-server HTTP (ownerKeyRouter
// is mounted ahead of apiRouter, so recovery legs exercise the live route):
// 1) SIMULTANEOUS failures from two instances must serialize (CAS), not bypass.
// 2) A lockout must survive an instance restart.
// 3) Unreadable attempt state must FAIL CLOSED (503), even for a correct PIN.
// 4) Recovery-key attempts share the same durable limiting; success clears.
// Usage: node e2e/pin-lockout-test.mjs
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = '/tmp/pin-lockout';
const DB = path.join(DIR, 'pin.db');
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const baseEnv = { ...process.env, NODE_ENV: 'test', TURSO_DATABASE_URL: `file:${DB}`, SESSION_SECRET: 'pin-shared-secret', TURSO_AUTH_TOKEN: 'x', VITE_DEV_SERVER_URL: '' };
const procs = [];
function startServer(port, env = {}) {
  const p = spawn('npx', ['tsx', 'server.ts', '--port', String(port)], { cwd: ROOT, env: { ...baseEnv, PORT: String(port), ...env }, stdio: ['ignore', fs.openSync(path.join(DIR, `srv-${port}.log`), 'w'), 'inherit'] });
  procs.push(p);
  return p;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp(port) {
  for (let i = 0; i < 240; i++) {
    try { await fetch(`http://127.0.0.1:${port}/api/archives`); return; } catch {}
    await sleep(500);
  }
  throw new Error(`server ${port} did not start`);
}
function cleanup() { for (const p of procs) { try { p.kill('SIGKILL'); } catch {} } }
process.on('exit', cleanup);

const pre = createClient({ url: `file:${DB}`, authToken: 'x' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();

const A = 3131, B = 3132, B2 = 3134, C = 3133;
let passed = 0, failed = 0;
const check = (n, c, e = '') => { if (c) { passed++; console.log('PASS', n); } else { failed++; console.log('FAIL', n, e); } };
const tryPin = (port, id, pin) => fetch(`http://127.0.0.1:${port}/api/archives/${id}/auth/pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) });
const tryKey = (port, key = 'mc_rec_wrong_key_000') => fetch(`http://127.0.0.1:${port}/api/archives/auth/key-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });

try {
  startServer(A); startServer(B);
  await waitUp(A); await waitUp(B);
  const recoveryKey = 'pin-probe-recovery-key-9';
  const create = await fetch(`http://127.0.0.1:${A}/api/archives`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'PIN Probe', organizationName: 'Fictional QA', archiveType: 'school', startYear: 2020, endYear: 2024, themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'pin-protected', editorPin: '582641', recoveryKey }),
  }).then((r) => r.json());
  const id = create.archive?.id;
  check('pin-protected archive created', !!id, JSON.stringify(create).slice(0, 160));

  // 1) SIMULTANEOUS failures: 8 concurrent wrong PINs split across A and B.
  const concurrent = await Promise.all([
    ...Array.from({ length: 4 }, () => tryPin(A, id, '000000')),
    ...Array.from({ length: 4 }, () => tryPin(B, id, '000000')),
  ]);
  const bodies = await Promise.all(concurrent.map((r) => r.clone().json().catch(() => ({}))));
  const lockedCount = bodies.filter((b) => typeof b.lockedUntil === 'number').length;
  check('all 8 simultaneous failures rejected', concurrent.every((r) => r.status === 401), concurrent.map((r) => r.status).join(','));
  console.log(`boundary actuals: ${lockedCount}/8 responses carried lockout; ${8 - lockedCount} plain wrong-PIN`);
  const afterConcurrent = await tryPin(A, id, '582641');
  check('correct PIN locked after simultaneous failures', afterConcurrent.status === 401, `got ${afterConcurrent.status}`);

  // 2) RESTART: kill B, start B2 - the lockout must survive.
  procs[1].kill('SIGKILL');
  await sleep(500);
  startServer(B2);
  await waitUp(B2);
  const afterRestart = await tryPin(B2, id, '582641');
  check('lockout survives instance restart (B2)', afterRestart.status === 401, `got ${afterRestart.status}`);

  // 3) STORAGE FAILURE: instance C cannot read its attempt state -> fail closed.
  startServer(C, { TURSO_DATABASE_URL: 'file:/tmp/pin-lockout-no-such-dir/c.db' });
  await waitUp(C);
  const cAttempt = await tryPin(C, id, '582641');
  check('correct PIN on broken-storage instance fails closed (503)', cAttempt.status === 503, `got ${cAttempt.status}`);

  // 4) RECOVERY limiter: 2 failures, a verified key clears, then 5 failures lock.
  await tryKey(A); await tryKey(A);
  const goodKey = await tryKey(B2, recoveryKey);
  check('correct recovery key on B succeeds (counter cleared)', goodKey.status === 200, `got ${goodKey.status}`);
  for (let i = 0; i < 5; i++) await tryKey(A);
  const b6 = await tryKey(B2);
  check('6th recovery attempt on B returns 429 (shared limit)', b6.status === 429, `got ${b6.status}`);

  // 5) CLEAR-VS-LOCK race: a verified sign-in's clear must never erase a
  // concurrent lockout. Fresh archive, 4 failures, then rounds of
  // [correct PIN || wrong PIN] racing; after each round the durable row is
  // either actively locked (and stays locked) or legitimately cleared.
  const create2 = await fetch(`http://127.0.0.1:${A}/api/archives`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Race Probe', organizationName: 'Fictional QA', archiveType: 'school', startYear: 2020, endYear: 2024, themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'pin-protected', editorPin: '739281', recoveryKey: 'race-probe-recovery-key' }),
  }).then((r) => r.json());
  const id2 = create2.archive?.id;
  check('second archive created for race rounds', !!id2);
  const dbx = createClient({ url: `file:${DB}`, authToken: 'x' });
  await dbx.execute('PRAGMA busy_timeout = 10000');
  const pinRowId = 'security-ratelimit-' + encodeURIComponent(`pin:${id2}:127.0.0.1`);
  const setRow = async (attempts) => {
    await dbx.execute({ sql: 'INSERT OR REPLACE INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)', args: [pinRowId, JSON.stringify({ attempts, firstAttemptAt: Date.now() }), `seed-${Date.now()}-${Math.random()}`] });
  };
  const readRow = async () => {
    const r = await dbx.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [pinRowId] });
    return r.rows[0] ? JSON.parse(String(r.rows[0].data)) : null;
  };
  let raceOk = true;
  for (let round = 0; round < 6; round += 1) {
    await setRow(4); // one failure away from lockout
    const [okPin, badPin] = await Promise.all([tryPin(A, id2, '739281'), tryPin(B, id2, '000000')]);
    const row = await readRow();
    const nowMs = Date.now();
    const locked = row && typeof row.lockedUntil === 'number' && row.lockedUntil > nowMs;
    if (locked) {
      // The 5th failure landed first: the clear MUST NOT have erased the lock.
      const probe = await tryPin(A, id2, '739281');
      if (probe.status === 200) { raceOk = false; console.log(`round ${round}: LOCK ERASED BY CLEAR`); }
      // Bounded availability residual: a verified sign-in whose authoritative
      // read PRECEDED the lock may complete; the lock itself stays intact.
      if (okPin.status === 200) console.log(`round ${round}: racing verified sign-in completed (lock intact, pre-lock read)`);
    } else {
      // The clear landed first: the racing failure must have started a FRESH
      // count (1), never inherited a cleared lock. A 503 here is an honest
      // contention denial (fail closed), not a bypass.
      if (row && row.attempts > 1) { raceOk = false; console.log(`round ${round}: stale count survived clear: ${row.attempts}`); }
      if (badPin.status !== 401 && badPin.status !== 503) { raceOk = false; console.log(`round ${round}: wrong pin not denied (${badPin.status})`); }
    }
  }
  check('clear-vs-lock race: lockout never erased across 6 rounds', raceOk);

  // 6) EXPIRED-WINDOW race: two concurrent failures on an expired entry must
  // serialize into a fresh count of 2 (reset must not erase fresh increments).
  await dbx.execute({ sql: 'INSERT OR REPLACE INTO oncehere_state (id, data, updated_at) VALUES (?, ?, ?)', args: [pinRowId, JSON.stringify({ attempts: 4, firstAttemptAt: Date.now() - 16 * 60 * 1000 }), `seed-old-${Date.now()}`] });
  const expiredPair = await Promise.all([tryPin(A, id2, '000000'), tryPin(B, id2, '000000')]);
  const expiredRow = await readRow();
  const counted = expiredPair.filter((r) => r.status === 401).length;
  const honestDenials = expiredPair.filter((r) => r.status === 503).length;
  // Every counted failure must appear in the durable row; contention denials
  // (503) are fail-closed and must not be counted.
  check('expired window + concurrent failures -> fresh count matches counted denials',
    !!expiredRow && expiredRow.attempts === counted && !expiredRow.lockedUntil && counted + honestDenials === 2 && counted >= 1,
    `row=${JSON.stringify(expiredRow)} statuses=${expiredPair.map((r) => r.status).join(',')}`);
  dbx.close();

  // Durable counter sanity: the pin row shows at least the lock threshold.
  const db = createClient({ url: `file:${DB}`, authToken: 'x' });
  const rows = await db.execute("SELECT id, data FROM oncehere_state WHERE id LIKE 'security-ratelimit-%'");
  const pinRow = rows.rows.find((r) => String(r.id).includes('pin%3A'));
  const pinData = pinRow ? JSON.parse(String(pinRow.data)) : null;
  check('durable pin counter reached lock threshold', !!pinData && pinData.attempts >= 5 && typeof pinData.lockedUntil === 'number', JSON.stringify(pinData));
  db.close();
} finally {
  cleanup();
  console.log(`pin-lockout: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
