// Storage-loss mid-session, UI level: a healthy editing session loses durable
// storage (write lock held externally -> all writes time out). The UI must
// show a save failure, must NOT show a false "Saved", must retain the user's
// draft, and the server must roll back the in-memory change. After storage
// returns, the retry must save.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';

const PORT = 3009, base = `http://127.0.0.1:${PORT}`;
const DIR = '/tmp/storage-loss-ui', DB = `${DIR}/sl.db`;
fs.rmSync(DB, { force: true }); fs.rmSync(`${DB}-wal`, { force: true }); fs.rmSync(`${DB}-shm`, { force: true });
fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync('/tmp/ui-shots', { recursive: true });
const pre = createClient({ url: `file:${DB}`, authToken: 'x' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();

const srv = spawn('npx', ['tsx', 'server.ts', '--port', String(PORT)], {
  cwd: '/tmp/oncehere-scan',
  env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT),
    TURSO_DATABASE_URL: `file:${DB}`, TURSO_AUTH_TOKEN: 'x', SESSION_SECRET: 'sl-secret',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999', OBJECT_STORAGE_BUCKET: 'sl-bucket',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'x', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'y',
    OBJECT_STORAGE_REGION: 'auto', OBJECT_STORAGE_FORCE_PATH_STYLE: 'true' },
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
  body: JSON.stringify({ archiveType: 'school', title: 'Storage Loss UI', organizationName: 'QA', subtitle: 'healthy-subtitle',
    startYear: 2022, endYear: 2026, themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'owner-only', recoveryKey: 'sl-key-12345678' }) })).json();
if (!c.archive) { console.log('CREATE FAILED', JSON.stringify(c).slice(0, 300)); process.exit(1); }
const id = c.archive.id, ws = c.archive.workspaceSlug, token = c.ownerToken;

async function durableSubtitle() {
  const dbc = createClient({ url: `file:${DB}`, authToken: 'x' });
  const r = await dbc.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
  const s = JSON.parse(String(r.rows[0].data));
  const snap = JSON.parse((s.compression === 'gzip' ? gunzipSync(Buffer.from(s.chunks.join(''), 'base64')) : Buffer.from(s.chunks.join(''), 'base64')).toString('utf8'));
  dbc.close(); return snap.archive.subtitle;
}
async function apiSubtitle() {
  const r = await fetch(base + `/api/archives/${id}`, { headers: { Authorization: 'Bearer ' + token } });
  return (await r.json()).archive.subtitle;
}

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + detail}`); ok ? passed++ : failed++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, token]);
const page = await ctx.newPage();
await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const editBtn = page.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn.count()) { await editBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
const sub = page.locator('textarea').first();

// --- baseline: healthy save works ---
let patchStatus = null;
page.on('response', (r) => { if (r.request().method() === 'PATCH' && r.url().includes(`/archives/${id}`)) patchStatus = r.status(); });
await sub.click(); await sub.fill('healthy-draft-v1'); await page.evaluate(() => document.activeElement && document.activeElement.blur());
await sub.click(); await sub.type('!');
await page.waitForTimeout(5000);
check('baseline healthy save persisted (PATCH 2xx)', patchStatus && patchStatus < 300, `got ${patchStatus}`);
check('baseline durable row updated', (await durableSubtitle()).startsWith('healthy-draft-v1'));

// --- storage breaks mid-session: external writer holds the DB write lock ---
const blocker = createClient({ url: `file:${DB}`, authToken: 'x' });
await blocker.execute('PRAGMA busy_timeout = 120000');
const held = await blocker.execute('BEGIN IMMEDIATE');
await blocker.execute("UPDATE oncehere_state SET updated_at = updated_at WHERE id = 'lock-placeholder-never-matches'").catch(() => {});

patchStatus = null;
await sub.click(); await sub.fill('unsaved-draft-v2'); await page.evaluate(() => document.activeElement && document.activeElement.blur());
await sub.click(); await sub.type('?');
// persist retries against the held lock until its busy_timeout gives up; wait generously
for (let i = 0; i < 120 && patchStatus === null; i++) await sleep(500);
check('save during outage is rejected (503, not 2xx)', patchStatus === 503, `got ${patchStatus}`);
const bodyText = await page.locator('body').innerText();
const errShown = /could not|not be saved|storage|retry|failed|try again/i.test(bodyText);
check('failure UI visible to the editor', errShown);
const savedMention = /saved/i.test(bodyText) && !/could not|not be saved|not saved|failed/i.test(bodyText);
check('NO false Saved indicator', !savedMention);
const draftKept = (await sub.inputValue().catch(() => '')).includes('unsaved-draft-v2');
check('user draft retained in the field', draftKept);
await page.screenshot({ path: '/tmp/ui-shots/sl-01-failed-save-draft-kept.png' });
check('server memory rolled back to last-good', (await apiSubtitle()).startsWith('healthy-draft-v1'), await apiSubtitle().catch(() => 'read-failed'));
check('durable row still last-good', (await durableSubtitle()).startsWith('healthy-draft-v1'));

// --- storage returns: retry saves ---
await blocker.execute('ROLLBACK').catch(() => {});
blocker.close();
patchStatus = null;
await sub.click(); await sub.type('#');
await page.waitForTimeout(6000);
check('retry after storage returns saves (PATCH 2xx)', patchStatus && patchStatus < 300, `got ${patchStatus}`);
check('durable row has the retried draft', (await durableSubtitle()).includes('unsaved-draft-v2'), await durableSubtitle().catch(() => 'read-failed'));
await page.screenshot({ path: '/tmp/ui-shots/sl-02-retry-saved.png' });

console.log(`storage-loss-ui: ${passed} passed, ${failed} failed`);
await browser.close();
srv.kill('SIGKILL');
process.exit(failed ? 1 : 0);
