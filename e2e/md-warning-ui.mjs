import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3000';
const J = { 'Content-Type': 'application/json' };
const c = await (await fetch(base + '/api/archives', { method: 'POST', headers: J,
  body: JSON.stringify({ archiveType: 'school', title: 'WarnUI Test', organizationName: 'QA', startYear: 2022, endYear: 2026,
    themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'open', recoveryKey: 'testkey-warn-ui-01' }) })).json();
const id = c.archive.id, ws = c.archive.workspaceSlug, H = { ...J, Authorization: 'Bearer ' + c.ownerToken };
const bytes = Buffer.from('ffd8ffe0' + '00'.repeat(200), 'hex');
const pre = await (await fetch(base + `/api/archives/${id}/media/upload-url`, { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'm.jpg', contentType: 'image/jpeg', size: bytes.length, purpose: 'vault' }) })).json();
await fetch(pre.uploadUrl, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/jpeg' } });
const cp = await (await fetch(base + `/api/archives/${id}/media/upload-complete`, { method: 'POST', headers: H, body: JSON.stringify({ fileName: 'm.jpg', key: pre.key, contentType: 'image/jpeg', size: bytes.length, purpose: 'vault' }) })).json();
const reg = await (await fetch(base + `/api/archives/${id}/media`, { method: 'POST', headers: H, body: JSON.stringify({ url: cp.url, storageKey: cp.storageKey, type: 'image', title: 'm', contentType: 'image/jpeg', fileSize: bytes.length }) })).json();
const mediaId = reg.item.id;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([w, t]) => sessionStorage.setItem('mc_workspace_' + w, t), [ws, c.ownerToken]);
const page = await ctx.newPage();
// intercept the DELETE: server saved but could not clean the stored file
await page.route(`**/api/archives/${id}/media/${mediaId}`, route => {
  if (route.request().method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, warning: 'The photo was removed from the archive, but the stored file could not be cleaned up right now.' }) });
  return route.continue();
});
await page.goto(base + '/workspace/' + ws, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.getByText('Media Vault', { exact: false }).first().click().catch(() => {});
await page.waitForTimeout(1500);
await page.locator('button:has(svg.lucide-trash2)').first().click();
await page.waitForTimeout(2000);
const notice = await page.getByText(/could not be cleaned up/i).count();
const redError = await page.getByText(/not saved yet/i).count();
const tiles = await page.locator('button:has(svg.lucide-trash2)').count();
console.log('amber warning notice visible:', notice > 0, '| red error banner:', redError > 0, '| remaining tiles:', tiles, '(0 = item removed)');
await page.screenshot({ path: '/tmp/ui-shots/md-06-warning-single.png' });
await b.close();
