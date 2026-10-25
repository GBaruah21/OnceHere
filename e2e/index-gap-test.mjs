// Index-discovery throttle-gap proof: an archive created on instance A must be
// reachable on instance B even inside B's 5s index-refresh throttle window.
// Usage: node e2e/index-gap-test.mjs
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = '/tmp/index-gap';
const DB = path.join(DIR, 'idx.db');
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const baseEnv = {
  ...process.env,
  NODE_ENV: 'test',
  TURSO_DATABASE_URL: `file:${DB}`,
  SESSION_SECRET: 'idx-shared-secret',
  TURSO_AUTH_TOKEN: 'unused-for-file',
  VITE_DEV_SERVER_URL: '',
};
const procs = [];
function startServer(port) {
  const p = spawn('npx', ['tsx', 'server.ts', '--port', String(port)], {
    cwd: ROOT, env: { ...baseEnv, PORT: String(port) },
    stdio: ['ignore', fs.openSync(path.join(DIR, `srv-${port}.log`), 'w'), 'inherit'],
  });
  procs.push(p);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp(port) {
  for (let i = 0; i < 240; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/archives`); if (r.status < 500) return; } catch {}
    await sleep(500);
  }
  throw new Error(`server ${port} did not start`);
}
function cleanup() { for (const p of procs) { try { p.kill('SIGKILL'); } catch {} } }
process.on('exit', cleanup);

const pre = createClient({ url: `file:${DB}`, authToken: 'unused-for-file' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();

const A = 3121, B = 3122;
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => { if (cond) { passed++; console.log('PASS', name); } else { failed++; console.log('FAIL', name, extra); } };

try {
  startServer(A); startServer(B);
  await waitUp(A); await waitUp(B);

  // Prime B's index throttle: an unknown-id request makes B run (and time-stamp)
  // an index refresh. Any refresh within the next 5s would be skipped.
  const unknown = await fetch(`http://127.0.0.1:${B}/api/archives/arc-does-not-exist`);
  check('unknown archive still 404s on B (negative control)', unknown.status === 404, `got ${unknown.status}`);

  // A creates an archive; its index row + tenant row land in the shared DB.
  const create = await fetch(`http://127.0.0.1:${A}/api/archives`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Index Gap Probe', organizationName: 'Fictional QA', archiveType: 'school',
      startYear: 2020, endYear: 2024, themeId: 'midnight-cinema', visibility: 'unlisted',
      contributionMode: 'owner-only', recoveryKey: 'idx-gap-recovery-key-123',
    }),
  }).then((r) => r.json());
  const id = create.archive?.id, slug = create.archive?.slug, token = create.ownerToken;
  check('archive created on A', !!id && !!token, JSON.stringify(create).slice(0, 160));

  // Immediately (well inside the 5s throttle) ask B by id and by slug.
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const byId = await fetch(`http://127.0.0.1:${B}/api/archives/${id}`, auth);
  const byIdBody = await byId.json().catch(() => ({}));
  check('B serves new archive by id inside throttle window', byId.status === 200 && byIdBody.archive?.id === id, `got ${byId.status}`);
  const bySlug = await fetch(`http://127.0.0.1:${B}/api/archives/by-slug/${slug}`, auth);
  const bySlugBody = await bySlug.json().catch(() => ({}));
  check('B resolves new archive by slug inside throttle window', bySlug.status === 200 && bySlugBody.archive?.id === id, `got ${bySlug.status}`);
  const unknown2 = await fetch(`http://127.0.0.1:${B}/api/archives/arc-still-not-there`);
  check('bogus id still 404s on B after gap fix', unknown2.status === 404, `got ${unknown2.status}`);
} finally {
  cleanup();
  console.log(`index-gap: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
