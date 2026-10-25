import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3000';
const slug = 'n2t-' + Date.now().toString(36);
const created = await (await fetch(base + '/api/archives', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ archiveType: 'school', title: 'N2Like', organizationName: 'QA', startYear: 2022, endYear: 2026,
    themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'open', recoveryKey: 'testkey-n2-0001' }) })).json();
const id = created.archive.id; const token = created.ownerToken;
await fetch(base + '/api/archives/' + id + '/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ finalSlug: slug }) });
// two wall posts
for (const t of ['post one', 'post two']) {
  await fetch(base + '/api/archives/' + id + '/wall', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorName: 'QA', text: t }) });
}
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /the wall/i }).first().click();
await page.waitForTimeout(1500);
// HEALTHY: like post one
const card1 = page.locator('div', { hasText: 'post one' }).last();
const likeBtn1 = card1.getByRole('button').filter({ has: page.locator('svg') }).first();
// more robust: find button near the post text containing heart
const heartBtns = page.locator('button:has(svg.lucide-heart)');
console.log('heart buttons found:', await heartBtns.count());
await heartBtns.first().click();
await page.waitForTimeout(800);
console.log('healthy like count text:', await heartBtns.first().innerText().catch(() => 'n/a'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /the wall/i }).first().click();
await page.waitForTimeout(1500);
const hearts2 = page.locator('button:has(svg.lucide-heart)');
console.log('after reload, first heart count text:', await hearts2.first().innerText().catch(() => 'n/a'));
// FAILURE: abort like endpoint, click second heart
await page.route('**/api/archives/*/wall/*/like', r => r.abort());
await hearts2.nth(1).click();
await page.waitForTimeout(1200);
const toast = await page.getByText('Could not save this like').count();
console.log('failure toast shown:', toast > 0);
console.log('second heart count after failed like:', await hearts2.nth(1).innerText().catch(() => 'n/a'));
await b.close();
