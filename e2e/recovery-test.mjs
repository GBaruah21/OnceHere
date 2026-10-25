// Recovery-restore behavior proof: does restoring the on-device draft after a
// 409 reload clobber the winner's unrelated fields on the retry save?
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createClient } from '@libsql/client';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const PORT = 3006, base = 'http://127.0.0.1:' + PORT;
const DIR = '/tmp/recovery-test', DB = DIR + '/r.db', BARRIER = DIR + '/barrier';
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(BARRIER, { recursive: true });
const pre = createClient({ url: 'file:' + DB, authToken: 'x' });
await pre.execute('PRAGMA journal_mode = WAL');
await pre.execute('CREATE TABLE IF NOT EXISTS oncehere_state (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)');
pre.close();
const srv = spawn('npx', ['tsx', 'server.ts', '--port', String(PORT)], {
  cwd: '/tmp/oncehere-scan',
  env: { ...process.env, NODE_ENV: 'test', PORT: String(PORT),
    TURSO_DATABASE_URL: 'file:' + DB, TURSO_AUTH_TOKEN: 'x', SESSION_SECRET: 'rec-secret',
    OBJECT_STORAGE_ENDPOINT: 'http://127.0.0.1:3999', OBJECT_STORAGE_BUCKET: 'rb',
    OBJECT_STORAGE_ACCESS_KEY_ID: 'x', OBJECT_STORAGE_SECRET_ACCESS_KEY: 'y',
    OBJECT_STORAGE_REGION: 'auto', OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    ONCEHERE_TEST_PERSIST_BARRIER_DIR: BARRIER, ONCEHERE_TEST_PERSIST_BARRIER_TAG: 'A' },
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
  body: JSON.stringify({ archiveType: 'school', title: 'Recovery Check', organizationName: 'QA', subtitle: 'orig-subtitle', batchLabel: 'orig-batch',
    startYear: 2022, endYear: 2026, themeId: 'midnight-cinema', visibility: 'unlisted', contributionMode: 'owner-only', recoveryKey: 'rec-key-12345678' }) })).json();
if (!c.archive) { console.log('CREATE FAILED', JSON.stringify(c).slice(0, 200)); process.exit(1); }
const id = c.archive.id, ws = c.archive.workspaceSlug, token = c.ownerToken;
const hold = BARRIER + '/hold-A-' + id, inside = BARRIER + '/inside-A-' + id;

async function durableSnapshot() {
  const db = createClient({ url: 'file:' + DB, authToken: 'x' });
  const r = await db.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-' + id] });
  const s = JSON.parse(String(r.rows[0].data));
  const buf = Buffer.from(s.chunks.join(''), 'base64');
  const snap = JSON.parse((s.compression === 'gzip' ? gunzipSync(buf) : buf).toString('utf8'));
  db.close(); return snap;
}
async function externalEdit(mutate) {
  const db = createClient({ url: 'file:' + DB, authToken: 'x' });
  const r = await db.execute({ sql: 'SELECT data FROM oncehere_state WHERE id = ?', args: ['tenant-' + id] });
  const s = JSON.parse(String(r.rows[0].data));
  const buf = Buffer.from(s.chunks.join(''), 'base64');
  const snap = JSON.parse((s.compression === 'gzip' ? gunzipSync(buf) : buf).toString('utf8'));
  mutate(snap);
  const json = JSON.stringify(snap);
  const enc = { format: s.format, chunks: [gzipSync(Buffer.from(json, 'utf8')).toString('base64')], sha256: createHash('sha256').update(json).digest('hex'), compression: 'gzip' };
  const newToken = new Date().toISOString() + '#ext-' + Math.random().toString(36).slice(2);
  await db.execute({ sql: 'UPDATE oncehere_state SET data = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(enc), newToken, 'tenant-' + id] });
  db.close();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, token]);
const page = await ctx.newPage();
await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
const editBtn = page.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn.count()) { await editBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
const sub = page.locator('textarea').first();

// Force the 409 while holding a draft
fs.writeFileSync(hold, '1'); fs.rmSync(inside, { force: true });
await sub.click(); await sub.fill('my-unsaved-draft');
for (let i = 0; i < 100 && !fs.existsSync(inside); i++) await sleep(50);
console.log('draft save held:', fs.existsSync(inside));
await externalEdit((snap) => { snap.archive.subtitle = 'winner-subtitle'; snap.archive.batchLabel = 'winner-batch'; });
fs.rmSync(hold, { force: true });
await page.waitForTimeout(3000);
const banner = await page.locator('body').innerText();
console.log('409 banner shown:', /Not saved yet/.test(banner));

// Reload: recovery offer should appear
let dialogSeen = '';
page.on('dialog', async (d) => { dialogSeen = d.message(); await d.accept(); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
console.log('recovery dialog offered:', dialogSeen.slice(0, 90) || 'NONE');
const subAfter = page.locator('textarea').first();
const restored = (await subAfter.inputValue().catch(() => '')) === 'my-unsaved-draft';
console.log('draft restored into field:', restored);
await page.screenshot({ path: '/tmp/ui-shots/rec-01-restored.png' });

// Autosave retry now carries the stale base: server must REJECT it (409),
// durable winner must survive, and the draft must remain recoverable on device.
await page.waitForTimeout(4000);
const snap = await durableSnapshot();
const banner2 = await page.locator('body').innerText();
const draftKept = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const v = localStorage.getItem(localStorage.key(i)); if (v && v.includes('my-unsaved-draft')) return true; } return false; });
console.log('after restore-retry: banner conflict shown:', /edited elsewhere/.test(banner2));
console.log('DURABLE AFTER REJECTED STALE RETRY: subtitle=', snap.archive.subtitle, '| batchLabel=', snap.archive.batchLabel, '| draft preserved on device:', draftKept);
console.log('RESULT:', snap.archive.subtitle === 'winner-subtitle' && snap.archive.batchLabel === 'winner-batch' && draftKept ? 'PROTECTED: stale restore-retry rejected, winner preserved, draft kept on device' : 'UNEXPECTED: ' + JSON.stringify({ sub: snap.archive.subtitle, batch: snap.archive.batchLabel, draftKept }));
await page.screenshot({ path: '/tmp/ui-shots/rec-02-stale-rejected.png' });

// Resolution path: reload, DECLINE the restore, edit fresh on winner state -> saves fine
await page.close().catch(() => {});
const page2 = await ctx.newPage(); // fresh page: the recovery confirm can abort in-place reloads
page2.on('dialog', async (d) => { await d.dismiss(); });
await page2.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
await page2.getByText('Media Vault', { exact: false }).first().waitFor({ timeout: 30000 }).catch(() => {});
await page2.waitForTimeout(4000);
const editBtn2 = page2.getByRole('button', { name: 'Edit', exact: true }).first();
if (await editBtn2.count()) { await editBtn2.click().catch(() => {}); await page2.waitForTimeout(800); }
const sub3 = page2.locator('textarea').first();
const actualSub = await sub3.inputValue().catch(() => '<no field>');
console.log('winner subtitle shown after decline-reload:', actualSub === 'winner-subtitle', '| actual:', JSON.stringify(actualSub));
await sub3.click(); await sub3.fill('fresh-edit-on-winner');
await page2.waitForTimeout(4000);
const snap2 = await durableSnapshot();
console.log('RESOLUTION PATH:', snap2.archive.subtitle === 'fresh-edit-on-winner' && snap2.archive.batchLabel === 'winner-batch' ? 'OK: fresh edit saved on winner state, winner fields intact' : 'FAILED: ' + JSON.stringify({ sub: snap2.archive.subtitle, batch: snap2.archive.batchLabel }));
// Fail-closed contract checks: missing base and wrong base both rejected, durable untouched
const H2 = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
const noBase = await fetch(base + '/api/archives/' + id, { method: 'PATCH', headers: H2, body: JSON.stringify({ subtitle: 'no-base-x' }) });
const noBaseBody = await noBase.json().catch(() => ({}));
const wrongBase = await fetch(base + '/api/archives/' + id, { method: 'PATCH', headers: H2, body: JSON.stringify({ subtitle: 'wrong-base-x', baseVersion: 'bogus-token' }) });
const wrongBaseBody = await wrongBase.json().catch(() => ({}));
const snap3 = await durableSnapshot();
console.log('missing-base PATCH rejected 409:', noBase.status === 409, '| code:', noBaseBody.code);
console.log('wrong-base PATCH rejected 409:', wrongBase.status === 409, '| code:', wrongBaseBody.code);
console.log('durable untouched by rejected writes:', snap3.archive.subtitle === 'fresh-edit-on-winner');

// Cross-flow case: a different flow (public-view font preset) edits settings and
// must advance saveVersion; a stale full-object save based on the pre-preset
// token must be rejected, and the winner's nested settings key must survive.
const g1 = await fetch(base + '/api/archives/' + id, { headers: H2 }).then((r) => r.json());
const v1 = g1.archive.saveVersion;
const settings1 = g1.archive.settings || {};
const fp = await fetch(base + '/api/archives/' + id, { method: 'PATCH', headers: H2, body: JSON.stringify({ settings: { ...settings1, fontPresetId: 'cross-flow-font' }, baseVersion: v1 }) });
const fpBody = await fp.json().catch(() => ({}));
const staleFull = await fetch(base + '/api/archives/' + id, { method: 'PATCH', headers: H2, body: JSON.stringify({ subtitle: 'stale-cross-flow', settings: settings1, baseVersion: v1 }) });
const snap4 = await durableSnapshot();
console.log('cross-flow preset saved:', fp.status === 200, '| saveVersion advanced:', typeof fpBody.archive?.saveVersion === 'string' && fpBody.archive.saveVersion !== v1);
console.log('stale full-object save after cross-flow rejected 409:', staleFull.status === 409);
console.log('winner nested settings intact durably:', snap4.archive.settings?.fontPresetId === 'cross-flow-font', '| stale subtitle not applied:', snap4.archive.subtitle !== 'stale-cross-flow');

// Legacy no-base draft: a draft written before saveVersion existed carries no
// token. Restoring it must be blocked (missing-save-base) and stay preserved on
// device - it must NOT inherit a freshly fetched token.
const legacyArchive = { ...snap4.archive, subtitle: 'legacy-no-base-draft' };
delete legacyArchive.saveVersion;
await page2.evaluate(([k, v]) => localStorage.setItem(k, v), ['oncehere-unsaved-' + id, JSON.stringify({ archive: legacyArchive })]);
page2.removeAllListeners('dialog');
let legacyDialog = '';
page2.on('dialog', async (d) => { legacyDialog = d.message(); await d.accept(); });
await page2.reload({ waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(5000);
const legacyRestored = (await page2.locator('textarea').first().inputValue().catch(() => '')) === 'legacy-no-base-draft';
await page2.waitForTimeout(4000);
const legacyBanner = await page2.locator('body').innerText();
const legacyDraftKept = await page2.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const v = localStorage.getItem(localStorage.key(i)); if (v && v.includes('legacy-no-base-draft')) return true; } return false; });
const snap5 = await durableSnapshot();
console.log('legacy draft restored into field:', legacyRestored, '| dialog:', legacyDialog.slice(0, 60) || 'NONE');
console.log('legacy no-base save blocked (banner):', /could not be checked|edited elsewhere/i.test(legacyBanner));
console.log('legacy draft preserved on device:', legacyDraftKept, '| durable subtitle unchanged:', snap5.archive.subtitle === 'fresh-edit-on-winner');
await page2.screenshot({ path: '/tmp/ui-shots/rec-03-legacy-blocked.png' });
await browser.close();
srv.kill('SIGKILL');
console.log('recovery-test done');
