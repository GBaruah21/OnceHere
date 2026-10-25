// Ordinary-flow friction probe: ONE editor, no other writer. Autosave A is
// held in the persist window while the user keeps typing, so autosave B
// fires with the same (now stale) baseVersion. Record ACTUAL statuses, UI,
// and durable state: does a solo user see a spurious "edited elsewhere" 409?
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';

const PORT = 3011, base = `http://127.0.0.1:${PORT}`;
const DIR = '/tmp/self-conflict', DB = `${DIR}/sc.db`, BARRIER = `${DIR}/barrier`;
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
    TURSO_DATABASE_URL: `file:${DB}`, TURSO_AUTH_TOKEN: 'x', SESSION_SECRET: 'sc-secret',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999', OBJECT_STORAGE_BUCKET: 'sc-bucket',
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
  body: JSON.stringify({ archiveType: 'school', title: 'Self Conflict', organizationName: 'QA', subtitle: 'orig',
    startYear: 2022, endYear: 2026, themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'owner-only', recoveryKey: 'sc-key-12345678' }) })).json();
if (!c.archive) { console.log('CREATE FAILED', JSON.stringify(c).slice(0, 300)); process.exit(1); }
const id = c.archive.id, ws = c.archive.workspaceSlug, token = c.ownerToken;
const hold = `${BARRIER}/hold-A-${id}`, inside = `${BARRIER}/inside-A-${id}`;

async function durableSubtitle() {
  const dbc = createClient({ url: `file:${DB}`, authToken: 'x' });
  const r = await dbc.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
  const s = JSON.parse(String(r.rows[0].data));
  const snap = JSON.parse((s.compression === 'gzip' ? gunzipSync(Buffer.from(s.chunks.join(''), 'base64')) : Buffer.from(s.chunks.join(''), 'base64')).toString('utf8'));
  dbc.close(); return snap.archive.subtitle;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, token]);
const page = await ctx.newPage();
const patches = [];
page.on('response', (r) => { if (r.request().method() === 'PATCH' && r.url().includes(`/archives/${id}`)) patches.push(r.status()); });
await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const editBtn = page.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn.count()) { await editBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
const sub = page.locator('textarea').first();

// Burst 1 -> autosave A will fire in ~500ms; hold its persist.
fs.writeFileSync(hold, '1'); fs.rmSync(inside, { force: true });
await sub.click(); await sub.fill('solo-draft-part1'); await page.evaluate(() => document.activeElement && document.activeElement.blur());
await sub.click(); await sub.type(' ');
for (let i = 0; i < 100 && !fs.existsSync(inside); i++) await sleep(50);
console.log('save A held in persist window:', fs.existsSync(inside));

// User keeps typing while A is still in flight -> autosave B fires with the same stale baseVersion.
await sub.click(); await sub.type('part2-continues');
await sleep(2500); // let B fire and resolve against the held barrier path
fs.rmSync(hold, { force: true });
await page.waitForTimeout(4000);
console.log('PATCH statuses (in order):', patches.join(', '));
const bodyText = await page.locator('body').innerText();
const conflictRe = /edited elsewhere|could not|not saved|retrying|retry\b/i;
const conflictShown = conflictRe.test(bodyText);
console.log('error/conflict UI visible to the SOLO editor:', conflictShown);
const m = bodyText.match(conflictRe);
if (m) { const i = bodyText.indexOf(m[0]); console.log('matched text context:', JSON.stringify(bodyText.slice(Math.max(0, i - 120), i + 160))); }
await page.screenshot({ path: '/tmp/ui-shots/self-01-after-overlap.png' });
console.log('durable subtitle after both saves:', JSON.stringify(await durableSubtitle()));

// Recovery check: one more normal edit with nothing held.
await sub.click(); await sub.type(' final');
await page.waitForTimeout(4000);
console.log('PATCH statuses after final edit:', patches.join(', '));
console.log('durable subtitle final:', JSON.stringify(await durableSubtitle()));
const bodyText2 = await page.locator('body').innerText();
console.log('still showing error UI after normal edit:', /edited elsewhere|could not|not saved/i.test(bodyText2));
await page.screenshot({ path: '/tmp/ui-shots/self-02-final.png' });
await browser.close();
srv.kill('SIGKILL');
process.exit(0);
