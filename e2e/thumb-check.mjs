import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import fs from 'node:fs';

const PORT = 3005, base = 'http://127.0.0.1:' + PORT;
const DIR = '/tmp/thumb-check', DB = DIR + '/t.db';
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
const pre = createClient({ url: 'file:' + DB, authToken: 'x' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();
const srv = spawn('npx', ['tsx', 'server.ts', '--port', String(PORT)], {
  cwd: '/tmp/oncehere-scan',
  env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT),
    TURSO_DATABASE_URL: 'file:' + DB, TURSO_AUTH_TOKEN: 'x', SESSION_SECRET: 'thumb-secret',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999', OBJECT_STORAGE_BUCKET: 'tb',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'x', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'y',
    OBJECT_STORAGE_REGION: 'auto', OBJECT_STORAGE_FORCE_PATH_STYLE: 'true' },
  stdio: ['ignore', fs.openSync(DIR + '/srv.log', 'w'), 'inherit'],
});
process.on('exit', () => { try { srv.kill('SIGKILL'); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srvUp = false;
for (let i = 0; i < 160; i++) { try { const r = await fetch(base + '/api/archives'); if (r.status === 200) { srvUp = true; break; } } catch {} await sleep(500); }
if (!srvUp) { console.log('server never came up'); process.exit(1); }
await sleep(2000);
const J = { 'Content-Type': 'application/json' };
const c = await (await fetch(base + '/api/archives', { method: 'POST', headers: J,
  body: JSON.stringify({ archiveType: 'school', title: 'Thumb Check', organizationName: 'QA', startYear: 2022, endYear: 2026,
    themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'owner-only', recoveryKey: 'thumb-key-123456' }) })).json();
if (!c.archive) { console.log('CREATE FAILED', JSON.stringify(c).slice(0, 200)); process.exit(1); }
const id = c.archive.id, ws = c.archive.workspaceSlug, token = c.ownerToken;
const H = { ...J, Authorization: 'Bearer ' + token };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const up = await (await fetch(base + '/api/archives/' + id + '/media/upload-url', { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'p.png', contentType: 'image/png', size: png.length, purpose: 'vault' }) })).json();
await fetch(up.uploadUrl, { method: 'PUT', body: png, headers: { 'Content-Type': 'image/png' } });
const cp = await (await fetch(base + '/api/archives/' + id + '/media/upload-complete', { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'p.png', key: up.key, contentType: 'image/png', size: png.length, purpose: 'vault' }) })).json();
const reg = await (await fetch(base + '/api/archives/' + id + '/media', { method: 'POST', headers: H, body: JSON.stringify({ url: cp.url, storageKey: cp.storageKey, type: 'image', title: 'p', contentType: 'image/png', fileSize: png.length }) })).json();
console.log('registered:', reg.success === true || !!reg.item);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, token]);
const page = await ctx.newPage();
await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
await page.getByText('Media Vault', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(2000);
const stats = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => ({ src: (i.currentSrc || i.src || '').slice(0, 90), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth })));
console.log('images:', JSON.stringify(stats));
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/ui-shots/thumb-valid-image.png' });
await browser.close();
srv.kill('SIGKILL');
console.log('thumb-check done');
