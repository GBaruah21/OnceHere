import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
const base = 'http://127.0.0.1:3000';
const J = { 'Content-Type': 'application/json' };
async function mkArchive(title, key) {
  const c = await (await fetch(base + '/api/archives', { method: 'POST', headers: J,
    body: JSON.stringify({ archiveType: 'school', title, organizationName: 'QA', startYear: 2022, endYear: 2026,
      themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'open', recoveryKey: key }) })).json();
  const id = c.archive.id, ws = c.archive.workspaceSlug, H = { ...J, Authorization: 'Bearer ' + c.ownerToken };
  const bytes = Buffer.from('ffd8ffe0' + '00'.repeat(200), 'hex');
  const pre = await (await fetch(base + `/api/archives/${id}/media/upload-url`, { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'm.jpg', contentType: 'image/jpeg', size: bytes.length, purpose: 'vault' }) })).json();
  await fetch(pre.uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/jpeg' } });
  const cp = await (await fetch(base + `/api/archives/${id}/media/upload-complete`, { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'm.jpg', key: pre.key, contentType: 'image/jpeg', size: bytes.length, purpose: 'vault' }) })).json();
  const reg = await (await fetch(base + `/api/archives/${id}/media`, { method: 'POST', headers: H, body: JSON.stringify({ url: cp.url, storageKey: cp.storageKey, type: 'image', title: 'm', contentType: 'image/jpeg', fileSize: bytes.length }) })).json();
  return { id, ws, token: c.ownerToken, mediaId: reg.item.id };
}
async function openEditor(browser, ws, token) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, token]);
  const page = await ctx.newPage();
  await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.getByText('Media Vault', { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  return page;
}
const browser = await chromium.launch();
// ---------- Scenario B: 503 forced persist failure ----------
const a1 = await mkArchive('DelUI-Fail', 'testkey-ui-fail-01');
let page = await openEditor(browser, a1.ws, a1.token);
let tiles = await page.locator('button:has(svg.lucide-trash2)').count();
console.log('B setup trash buttons:', tiles);
execSync('chmod 444 /tmp/oncehere-local-test.db');
await page.locator('button:has(svg.lucide-trash2)').first().click();
await page.waitForTimeout(2500);
const errVisible = await page.getByText(/could not|retry|save/i).count();
const stillThere = await page.locator('button:has(svg.lucide-trash2)').count();
console.log('B after click: error UI visible:', errVisible > 0, '| item still in UI:', stillThere > 0);
await page.screenshot({ path: '/tmp/ui-shots/md-01-503-item-retained.png' });
execSync('chmod 644 /tmp/oncehere-local-test.db');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.getByText('Media Vault', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1200);
console.log('B after reload, item present:', (await page.locator('button:has(svg.lucide-trash2)').count()) > 0);
await page.screenshot({ path: '/tmp/ui-shots/md-02-503-after-reload.png' });
await page.context().close();
// ---------- Scenario A: 200 + cleanup warning ----------
const a2 = await mkArchive('DelUI-Warn', 'testkey-ui-warn-01');
page = await openEditor(browser, a2.ws, a2.token);
const pid = execSync("pgrep -f '^node mock-s3.mjs'").toString().trim();
process.kill(Number(pid));
await page.waitForTimeout(300);
const pageTextBefore = await page.locator('body').innerText();
await page.locator('button:has(svg.lucide-trash2)').first().click();
await page.waitForTimeout(2500);
const goneFromUI = (await page.locator('button:has(svg.lucide-trash2)').count()) === 0;
const bodyText = await page.locator('body').innerText();
const warnShown = /could not be cleaned up|stored file/i.test(bodyText);
console.log('A after click: item gone from UI:', goneFromUI, '| cleanup warning surfaced anywhere:', warnShown);
await page.screenshot({ path: '/tmp/ui-shots/md-03-warning-scenario.png' });
execSync('cd /tmp/oncehere-scan && nohup node mock-s3.mjs > /tmp/mocks3.log 2>&1 &');
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.getByText('Media Vault', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1200);
console.log('A after reload, item gone (server truth):', (await page.locator('button:has(svg.lucide-trash2)').count()) === 0);
await page.screenshot({ path: '/tmp/ui-shots/md-04-warning-after-reload.png' });
await browser.close();
