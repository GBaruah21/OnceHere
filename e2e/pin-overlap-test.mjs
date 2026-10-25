// Cross-flow overlap: autosave (settings) held in persist while the user
// changes the contributor PIN. Both base-carrying saves must complete with
// no 409, the PIN must actually change, and the subtitle draft must land.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';

const PORT = 3012, base = `http://127.0.0.1:${PORT}`;
const DIR = '/tmp/pin-overlap', DB = `${DIR}/po.db`, BARRIER = `${DIR}/barrier`;
fs.rmSync(DB, { force: true }); fs.rmSync(`${DB}-wal`, { force: true }); fs.rmSync(`${DB}-shm`, { force: true });
fs.rmSync(BARRIER, { recursive: true, force: true });
fs.mkdirSync(BARRIER, { recursive: true }); fs.mkdirSync('/tmp/ui-shots', { recursive: true });
const pre = createClient({ url: `file:${DB}`, authToken: 'x' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();

const srv = spawn('npx', ['tsx', 'server.ts', '--port', String(PORT)], {
  cwd: '/tmp/oncehere-scan',
  env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT),
    TURSO_DATABASE_URL: `file:${DB}`, TURSO_AUTH_TOKEN: 'x', SESSION_SECRET: 'po-secret',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999', OBJECT_STORAGE_BUCKET: 'po-bucket',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'x', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'y',
    OBJECT_STORAGE_REGION: 'auto', OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    ONCEHERE_TEST_PERSIST_BARRIER_DIR: BARRIER, ONCEHERE_TEST_PERSIST_BARRIER_TAG: 'A' },
  stdio: ['ignore', fs.openSync(`${DIR}/srv.log`, 'w'), 'inherit'],
});
process.on('exit', () => { try { srv.kill('SIGKILL'); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srvUp = false;
for (let i = 0; i < 160; i++) { try { const r = await fetch(base + '/api/archives'); if (r.status === 200) { srvUp = true; break; } } catch {} await sleep(500); }
if (!srvUp) { console.log('server never came up'); process.exit(1); }
await sleep(2000);

const J = { 'Content-Type': 'application/json' };
const c = await (await fetch(base + '/api/archives', { method: 'POST', headers: J,
  body: JSON.stringify({ archiveType: 'school', title: 'Pin Overlap', organizationName: 'QA', subtitle: 'orig',
    startYear: 2022, endYear: 2026, themeId: 'midnight-cinema', visibility: 'unlisted',
    contributionMode: 'pin-protected', editorPin: '739281', recoveryKey: 'po-key-12345678' }) })).json();
if (!c.archive) { console.log('CREATE FAILED', JSON.stringify(c).slice(0, 300)); process.exit(1); }
const id = c.archive.id, ws = c.archive.workspaceSlug, token = c.ownerToken;
const hold = `${BARRIER}/hold-A-${id}`, inside = `${BARRIER}/inside-A-${id}`;

let passed = 0, failed = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' ' + d}`); ok ? passed++ : failed++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, token]);
const page = await ctx.newPage();
const patches = [];
page.on('response', (r) => {
  if (r.request().method() === 'PATCH' && r.url().includes(`/archives/${id}`)) {
    patches.push(r.status());
    console.log('PATCH', r.status(), (r.request().postData() || '').slice(0, 110));
  }
});
await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const editBtn = page.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn.count()) { await editBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
// Subtitle textarea lives in the default (Hero) inspector tab; edit it FIRST,
// then switch tabs while its autosave is held in the persist window.
const sub = page.locator('textarea').first();

// Autosave A held in persist.
fs.writeFileSync(hold, '1'); fs.rmSync(inside, { force: true });
await sub.click(); await sub.fill('overlap-draft'); await page.evaluate(() => document.activeElement && document.activeElement.blur());
await sub.click(); await sub.type(' ');
for (let i = 0; i < 100 && !fs.existsSync(inside); i++) await sleep(50);
check('autosave held in persist window', fs.existsSync(inside));

// Exact name: 'Access Log' in the header also matches /Access/i and opens the
// access-history modal (an earlier run's interception was that test-opened modal).
await page.getByRole('button', { name: 'Access & Privacy' }).click({ timeout: 8000 });
await page.waitForTimeout(800);

// While held: change the contributor PIN through the UI.
const pinInput = page.getByPlaceholder('Enter new 4 or 6 digit numeric PIN');
check('pin input visible', await pinInput.count() === 1, `count=${await pinInput.count()}`);
await pinInput.fill('482016');
await page.getByRole('button', { name: 'Save Contributor PIN' }).click();
await sleep(1500); // pin save must be queued behind the held autosave, not rejected
fs.rmSync(hold, { force: true });
await page.waitForTimeout(5000);

console.log('PATCH statuses:', patches.join(', '));
check('no 409 from own overlapping flows', !patches.includes(409), patches.join(','));
check('both saves succeeded', patches.length >= 2 && patches.every((s) => s === 200), patches.join(','));
const bodyText = await page.locator('body').innerText();
check('PIN updated confirmation visible', /PIN updated/i.test(bodyText));
check('no error banner', !/edited elsewhere|could not be saved|not saved/i.test(bodyText));
await page.screenshot({ path: '/tmp/ui-shots/po-01-overlap-clean.png' });

// Server truth: durable subtitle is the new draft, and the NEW pin works, old fails.
const dbc = createClient({ url: `file:${DB}`, authToken: 'x' });
const r = await dbc.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
const s = JSON.parse(String(r.rows[0].data));
const snap = JSON.parse((s.compression === 'gzip' ? gunzipSync(Buffer.from(s.chunks.join(''), 'base64')) : Buffer.from(s.chunks.join(''), 'base64')).toString('utf8'));
dbc.close();
check('durable subtitle has the draft', String(snap.archive.subtitle).startsWith('overlap-draft'), JSON.stringify(snap.archive.subtitle));
const newPin = await fetch(base + `/api/archives/${id}/auth/pin`, { method: 'POST', headers: J, body: JSON.stringify({ pin: '482016' }) });
const oldPin = await fetch(base + `/api/archives/${id}/auth/pin`, { method: 'POST', headers: J, body: JSON.stringify({ pin: '739281' }) });
check('new PIN signs in', newPin.status === 200, `got ${newPin.status}`);
check('old PIN rejected', oldPin.status === 401, `got ${oldPin.status}`);

console.log(`pin-overlap: ${passed} passed, ${failed} failed`);
await browser.close();
srv.kill('SIGKILL');
process.exit(failed ? 1 : 0);
