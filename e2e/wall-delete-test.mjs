import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3000';
const slug = 'wdel-' + Date.now().toString(36);
const results = [];
const check = (n, ok, d='') => { results.push({n, ok}); console.log((ok?'PASS':'FAIL')+' | '+n+(d?' | '+d:'')); };
const created = await (await fetch(base + '/api/archives', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ archiveType: 'school', title: 'WallDel', organizationName: 'QA', startYear: 2022, endYear: 2026,
    themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'open', recoveryKey: 'testkey-wdel-001' }) })).json();
const id = created.archive.id; const token = created.ownerToken;
await fetch(base + '/api/archives/' + id + '/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ finalSlug: slug }) });
const wpJ = await (await fetch(base + '/api/archives/' + id + '/wall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: 'QA', authorRole: 'Classmate', text: 'Wall note to delete', cardStyle: 'polaroid' }) })).json();
const wallId = wpJ.post?.id;
const getWall = async () => { const a = await (await fetch(base + '/api/archives/by-slug/' + slug, { cache: 'no-store' })).json(); return a.wall || []; };
check('T4a wall fixture posted', Boolean(wallId));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(([aid, tok]) => { sessionStorage.setItem('mc_owner_' + aid, tok); }, [id, token]);
const gotoWall = async (pg) => {
  await pg.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(3000);
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pg.waitForTimeout(1200);
  const t = pg.getByText('Wall note to delete').last();
  await t.waitFor({ state: 'attached', timeout: 15000 });
  await t.scrollIntoViewIfNeeded();
  await pg.waitForTimeout(500);
};
await gotoWall(page);

// FAIL the delete -> rollback expected
await page.route('**/api/archives/*/wall/*', r => r.request().method() === 'DELETE' ? r.abort() : r.continue());
await page.locator('button[title="Delete note permanently"]').first().click();
await page.getByRole('button', { name: 'Yes' }).click();
await page.waitForTimeout(2000);
check('T4b failed wall delete: post restored in UI', (await page.getByText('Wall note to delete').count()) > 0);
check('T4c failed wall delete: still on server', (await getWall()).some(p => p.id === wallId));
check('T4d error toast on failed wall delete', (await page.locator('text=/could not delete/i').count()) > 0);
check('T4e NO false "permanently deleted" toast', (await page.locator('text=/permanently deleted/i').count()) === 0);
await page.screenshot({ path: '/tmp/ui-shots/vis-04-wall-delete-rollback.png' });
await page.unroute('**/api/archives/*/wall/*');

// Real delete
await page.locator('button[title="Delete note permanently"]').first().click();
await page.getByRole('button', { name: 'Yes' }).click();
await page.waitForTimeout(1200);
check('T4f success toast shown', (await page.locator('text=/permanently deleted/i').count()) > 0);
check('T4g delete persisted server-side', !(await getWall()).some(p => p.id === wallId));

// stale-cache anti-resurrection: plant deleted post in localStorage, reload
await page.evaluate(([aid, pid]) => {
  localStorage.setItem('archive_wall_' + aid, JSON.stringify([{ id: pid, authorName: 'QA', authorRole: 'Classmate', text: 'Wall note to delete', cardStyle: 'polaroid', createdAt: new Date().toISOString() }]));
}, [id, wallId]);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1200);
check('T4h tombstoned post NOT resurrected from stale localStorage', (await page.getByText('Wall note to delete').count()) === 0);
await page.screenshot({ path: '/tmp/ui-shots/vis-05-wall-no-resurrection.png' });

// fresh visitor = new browser context with an empty HTTP cache
const freshCtx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const tab2 = await freshCtx.newPage();
await tab2.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' });
await tab2.waitForTimeout(3000);
await tab2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await tab2.waitForTimeout(1000);
check('T4i wall note gone for a fresh visitor', (await tab2.getByText('Wall note to delete').count()) === 0);
await tab2.close();
await freshCtx.close();

// tombstone must NOT hide a real server-returned post: post a new note server-side, reload, must appear
await fetch(base + '/api/archives/' + id + '/wall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: 'QA', authorRole: 'Classmate', text: 'Server post must show', cardStyle: 'polaroid' }) });
const freshCtx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
const tab3 = await freshCtx2.newPage();
await tab3.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' });
await tab3.waitForTimeout(3000);
await tab3.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await tab3.waitForTimeout(1200);
check('T4j server-returned post shown to fresh visitor (tombstones do not hide server truth)', (await tab3.getByText('Server post must show').count()) > 0);
await tab3.close();
await freshCtx2.close();
await b.close();
const fails = results.filter(r => !r.ok);
console.log('\n==== ' + (results.length - fails.length) + '/' + results.length + ' passed ====');
process.exit(fails.length ? 1 : 0);
