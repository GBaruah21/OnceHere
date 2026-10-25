// Editor UI conflict pixels: 409 edit-conflict + 503 delete-conflict.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const PORT = 3004, base = `http://127.0.0.1:${PORT}`;
const DIR = '/tmp/conflict-ui', DB = `${DIR}/cui.db`, BARRIER = `${DIR}/barrier`;
fs.rmSync(DB, { force: true }); fs.rmSync(`${DB}-wal`, { force: true }); fs.rmSync(`${DB}-shm`, { force: true });
fs.mkdirSync(BARRIER, { recursive: true });
const pre = createClient({ url: `file:${DB}`, authToken: 'x' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();

const srv = spawn('npx', ['tsx', 'server.ts', '--port', String(PORT)], {
  cwd: '/tmp/oncehere-scan',
  env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT),
    TURSO_DATABASE_URL: `file:${DB}`, TURSO_AUTH_TOKEN: 'x', SESSION_SECRET: 'cui-secret',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999', OBJECT_STORAGE_BUCKET: 'cui-bucket',
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
await sleep(2000); // let vite finish first-compile

const J = { 'Content-Type': 'application/json' };
const c = await (await fetch(base + '/api/archives', { method: 'POST', headers: J,
  body: JSON.stringify({ archiveType: 'school', title: 'Conflict UI', organizationName: 'QA', subtitle: 'orig-subtitle',
    startYear: 2022, endYear: 2026, themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'owner-only', recoveryKey: 'cui-key-12345678' }) })).json();
if (!c.archive) { console.log('CREATE FAILED', JSON.stringify(c).slice(0, 300)); process.exit(1); }
const id = c.archive.id, ws = c.archive.workspaceSlug, token = c.ownerToken;
const H = { ...J, Authorization: 'Bearer ' + token };
const hold = `${BARRIER}/hold-A-${id}`, inside = `${BARRIER}/inside-A-${id}`;

async function durableSnapshot() {
  const db = createClient({ url: `file:${DB}`, authToken: 'x' });
  const r = await db.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
  const s = JSON.parse(String(r.rows[0].data));
  const buf = Buffer.from(s.chunks.join(''), 'base64');
  const snap = JSON.parse((s.compression === 'gzip' ? gunzipSync(buf) : buf).toString('utf8'));
  db.close(); return snap;
}
async function externalEdit(mutate) {
  const db = createClient({ url: `file:${DB}`, authToken: 'x' });
  const r = await db.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: [`tenant-${id}`] });
  const s = JSON.parse(String(r.rows[0].data));
  const buf = Buffer.from(s.chunks.join(''), 'base64');
  const snap = JSON.parse((s.compression === 'gzip' ? gunzipSync(buf) : buf).toString('utf8'));
  mutate(snap);
  const json = JSON.stringify(snap);
  const enc = { format: s.format, chunks: [gzipSync(Buffer.from(json, 'utf8')).toString('base64')], sha256: createHash('sha256').update(json).digest('hex'), compression: 'gzip' };
  const newToken = new Date().toISOString() + '#ext-' + Math.random().toString(36).slice(2);
  await db.execute({ sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(enc), newToken, `tenant-${id}`] });
  db.close();
}

const browser = await chromium.launch();
async function openEditor() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, token]);
  const page = await ctx.newPage();
  await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  return page;
}

// ---------- Scenario 1: 409 edit-conflict ----------
let page = await openEditor();
const editBtn = page.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn.count()) { await editBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
const sub = page.locator('textarea').first();
await sub.click(); await sub.fill('my-draft-subtitle'); await page.evaluate(() => document.activeElement && document.activeElement.blur());

fs.writeFileSync(hold, '1'); fs.rmSync(inside, { force: true });
let patchStatus = null;
page.on('response', (r) => { if (r.request().method() === 'PATCH' && r.url().includes(`/archives/${id}`)) patchStatus = r.status(); });
// trigger save: type one more char so the autosave fires while the barrier holds it
await sub.click(); await sub.type('!');
for (let i = 0; i < 100 && !fs.existsSync(inside); i++) await sleep(50);
console.log('S1 save held in persist window:', fs.existsSync(inside));
await externalEdit((snap) => { snap.archive.subtitle = 'winner-subtitle'; snap.archive.batchLabel = 'winner-batch'; });
fs.rmSync(hold, { force: true });
await page.waitForTimeout(3000);
console.log('S1 PATCH status:', patchStatus);
const s1text = await page.locator('body').innerText();
const errShown = /could not|conflict|changed elsewhere|retry|not saved|failed/i.test(s1text);
const falseSaved = /(^|\n)\s*(saved|all changes saved)\s*(\n|$)/i.test(s1text) && !/not|could/i.test(s1text.slice(Math.max(0, s1text.search(/saved/i) - 40), s1text.search(/saved/i)));
const draftKept = (await sub.inputValue().catch(() => '')).includes('my-draft-subtitle');
console.log('S1 error UI visible:', errShown, '| false saved indicator:', falseSaved, '| draft retained:', draftKept);
await page.screenshot({ path: '/tmp/ui-shots/cui-01-409-conflict.png' });

// Retry after winner refresh
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
const editBtn2 = page.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn2.count()) { await editBtn2.click().catch(() => {}); await page.waitForTimeout(800); }
const sub2 = page.locator('textarea').first();
const winnerShown = (await sub2.inputValue().catch(() => '')).includes('winner-subtitle');
await sub2.click(); await sub2.fill('retry-subtitle'); await page.evaluate(() => document.activeElement && document.activeElement.blur());
await sub2.click(); await sub2.type('!');
patchStatus = null;
await page.waitForTimeout(4000);
const snap1 = await durableSnapshot();
console.log('S1 retry: winner shown after reload:', winnerShown, '| retry PATCH status:', patchStatus,
  '| durable subtitle:', snap1.archive.subtitle, '| winner batchLabel preserved:', snap1.archive.batchLabel === 'winner-batch');
await page.screenshot({ path: '/tmp/ui-shots/cui-02-retry-saved.png' });
await page.context().close();

// ---------- Scenario 2: 503 delete-conflict ----------
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const up = await (await fetch(base + `/api/archives/${id}/media/upload-url`, { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'd.png', contentType: 'image/png', size: bytes.length, purpose: 'vault' }) })).json();
await fetch(up.uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/png' } });
const cp = await (await fetch(base + `/api/archives/${id}/media/upload-complete`, { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'd.jpg', key: up.key, contentType: 'image/png', size: bytes.length, purpose: 'vault' }) })).json();
const mreg = await fetch(base + `/api/archives/${id}/media`, { method: 'POST', headers: H, body: JSON.stringify({ url: cp.url, storageKey: cp.storageKey, type: 'image', title: 'd', contentType: 'image/png', fileSize: bytes.length }) });
console.log('S2 media register status:', mreg.status, JSON.stringify(await mreg.json().catch(() => null)).slice(0, 200));
console.log('S2 upload-complete url:', cp.url ? 'ok' : JSON.stringify(cp).slice(0, 200));

page = await openEditor();
const editBtn3 = page.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn3.count()) { await editBtn3.click().catch(() => {}); await page.waitForTimeout(800); }
await page.getByText('Media Vault', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1500);
const trash = page.locator('button:has(svg.lucide-trash2)').first();
console.log('S2 trash buttons:', await page.locator('button:has(svg.lucide-trash2)').count());
fs.writeFileSync(hold, '1'); fs.rmSync(inside, { force: true });
await trash.click();
for (let i = 0; i < 100 && !fs.existsSync(inside); i++) await sleep(50);
console.log('S2 delete held in persist window:', fs.existsSync(inside));
await externalEdit((snap) => { snap.archive.subtitle = 'winner-subtitle-2'; });
fs.rmSync(hold, { force: true });
await page.waitForTimeout(3000);
const s2text = await page.locator('body').innerText();
console.log('S2 error UI visible:', /could not|retry|save|failed/i.test(s2text), '| item still in UI:', (await page.locator('button:has(svg.lucide-trash2)').count()) > 0);
await page.locator('button:has(svg.lucide-trash2)').first().scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(800);
const tileOk = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.src.includes('media-object')).map((i) => i.complete && i.naturalWidth > 0));
console.log('S2 retained tile renders (valid image):', JSON.stringify(tileOk));
await page.screenshot({ path: '/tmp/ui-shots/cui-03-503-delete-conflict.png' });
const snap2 = await durableSnapshot();
console.log('S2 durable: media retained:', (snap2.mediaItems || []).length === 1, '| winner subtitle:', snap2.archive.subtitle);
await browser.close();
srv.kill('SIGKILL');
console.log('conflict-ui done');
