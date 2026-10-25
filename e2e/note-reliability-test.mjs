import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3000';
const slug = 'note-rel-' + Date.now().toString(36);
const results = [];
const check = (name, ok, detail='') => { results.push({ name, ok, detail }); console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : '')); };

// --- fixture: open-mode archive with one photo ---
const created = await (await fetch(base + '/api/archives', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ archiveType: 'school', title: 'Note Reliability QA', organizationName: 'QA School', startYear: 2022, endYear: 2026,
    themeId: 'midnight-cinema', visibility: 'public', contributionMode: 'open', recoveryKey: 'testkey-rel-0001' }) })).json();
const id = created.archive.id; const token = created.ownerToken;
await fetch(base + '/api/archives/' + id + '/deploy', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ finalSlug: slug }) });
const medJ = await (await fetch(base + '/api/archives/' + id + '/media', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({ url: 'https://picsum.photos/seed/rel1/800/600.jpg', type: 'image', title: 'QA Photo' }) })).json();
const mediaId = medJ.item?.id || medJ.media?.id || medJ.id;
const getNotes = async () => {
  const a = await (await fetch(base + '/api/archives/by-slug/' + slug)).json();
  return (a.media || []).find(m => m.id === mediaId)?.notes || [];
};
const getWall = async () => {
  const a = await (await fetch(base + '/api/archives/by-slug/' + slug)).json();
  return a.wall || [];
};

// T0: API-level permissions - anonymous note POST allowed (open mode), anonymous DELETE denied
const anonNote = await fetch(base + '/api/archives/' + id + '/media/' + mediaId + '/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: 'Anon', text: 'anon note for perm test' }) });
check('T0a anon note POST accepted (open mode)', anonNote.status === 201, 'status ' + anonNote.status);
const anonNoteJ = await anonNote.json();
const del403 = await fetch(base + '/api/archives/' + id + '/media/' + mediaId + '/notes/' + anonNoteJ.note.id, { method: 'DELETE' });
check('T0b anon note DELETE denied', del403.status === 403, 'status ' + del403.status);
const delBadTok = await fetch(base + '/api/archives/' + id + '/media/' + mediaId + '/notes/' + anonNoteJ.note.id, { method: 'DELETE', headers: { Authorization: 'Bearer bogus' } });
check('T0c bad-token note DELETE denied', delBadTok.status === 403, 'status ' + delBadTok.status);
const delOwner = await fetch(base + '/api/archives/' + id + '/media/' + mediaId + '/notes/' + anonNoteJ.note.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
check('T0d owner note DELETE accepted', delOwner.ok, 'status ' + delOwner.status);
check('T0e server truth: perm-test note gone', (await getNotes()).length === 0);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(([aid, tok]) => { sessionStorage.setItem('mc_owner_' + aid, tok); }, [id, token]);

const openLightboxRobust = async (pg) => {
  await pg.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(3000);
  await pg.getByRole('button', { name: /media vault/i }).first().click();
  const snap = pg.getByText('Memory Snapshot').first();
  await snap.waitFor({ state: 'visible', timeout: 15000 });
  await snap.click();
  await pg.locator('textarea[placeholder*="inside joke"]').waitFor({ state: 'visible', timeout: 15000 });
};
const openLightbox = async () => {
  await page.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.getByRole('button', { name: /media vault/i }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('Memory Snapshot').first().click();
  await page.waitForTimeout(1500);
};

// T1: photo-note SAVE success persists server-side and survives reload
await openLightbox();
await page.locator('textarea[placeholder*="memory" i], textarea[placeholder*="story" i], textarea').last().fill('Reliable note one');
await page.locator('input[placeholder*="name" i]').last().fill('QA');
await page.getByRole('button', { name: /save note|add note|post note|attach/i }).first().click();
await page.waitForTimeout(2000);
let serverNotes = await getNotes();
check('T1a note persisted server-side after UI save', serverNotes.length === 1 && serverNotes[0].text === 'Reliable note one', 'count=' + serverNotes.length);
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
await page.getByRole('button', { name: /media vault/i }).first().click();
const snap1 = page.getByText('Memory Snapshot').first();
await snap1.waitFor({ state: 'visible', timeout: 15000 });
await snap1.click();
await page.locator('textarea[placeholder*="inside joke"]').waitFor({ state: 'visible', timeout: 15000 });
const visible1 = await page.locator('p', { hasText: 'Reliable note one' }).count();
check('T1b note visible after full reload', visible1 > 0);
await page.screenshot({ path: '/tmp/ui-shots/fix-01-note-persisted-reload.png' });

// T2: SAVE failure - rollback, error toast, draft retained
await page.route('**/api/archives/*/media/*/notes', r => r.request().method() === 'POST' ? r.abort() : r.continue());
await page.locator('textarea').last().fill('Do not lose this draft');
await page.locator('input[placeholder*="name" i]').last().fill('QA');
await page.getByRole('button', { name: /save note|add note|post note|attach/i }).first().click();
await page.waitForTimeout(2000);
const ghostVisible = await page.locator('p', { hasText: 'Do not lose this draft' }).count();
const draftBack = await page.locator('textarea').last().inputValue();
serverNotes = await getNotes();
check('T2a failed save shows NO ghost note in list', ghostVisible === 0, 'ghostCount=' + ghostVisible);
check('T2b failed save NOT persisted server-side', serverNotes.length === 1, 'count=' + serverNotes.length);
check('T2c typed draft retained in box after failure', draftBack === 'Do not lose this draft', JSON.stringify(draftBack));
const toast = await page.locator('text=/could not save|failed to fetch/i').count();
check('T2d error toast shown on failed save', toast > 0);
await page.screenshot({ path: '/tmp/ui-shots/fix-02-save-failure-rollback.png' });
await page.unroute('**/api/archives/*/media/*/notes');

// T3: visible delete icon (no hover needed) + delete success persists + survives reload + cross-tab
await page.locator('p', { hasText: 'Reliable note one' }).first().waitFor({ state: 'visible', timeout: 15000 });
await page.locator('button[title="Delete Note"]').first().waitFor({ state: 'visible', timeout: 15000 });
const delBtn = page.locator('button[title="Delete Note"]').first();
const delCount = await delBtn.count();
let hidden = null;
if (delCount > 0) { hidden = await delBtn.evaluate(el => getComputedStyle(el).opacity); }
check('T3a delete icon present and visible without hover', delCount > 0 && hidden === '1', 'opacity=' + hidden);
await page.screenshot({ path: '/tmp/ui-shots/fix-03-visible-delete-nohover.png' });
await delBtn.click();
await page.waitForTimeout(2000);
serverNotes = await getNotes();
check('T3b delete persisted server-side', serverNotes.length === 0, 'count=' + serverNotes.length);
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
await page.getByRole('button', { name: /media vault/i }).first().click();
const snap2 = page.getByText('Memory Snapshot').first();
await snap2.waitFor({ state: 'visible', timeout: 15000 });
await snap2.click();
await page.locator('textarea[placeholder*="inside joke"]').waitFor({ state: 'visible', timeout: 15000 });
check('T3c note still gone after reload', (await page.locator('p', { hasText: 'Reliable note one' }).count()) === 0);
const tab2 = await ctx.newPage();
await openLightboxRobust(tab2);
check('T3d note gone in second tab too', (await tab2.locator('p', { hasText: 'Reliable note one' }).count()) === 0);
check('T3e viewer (no owner token) sees no delete icon', (await tab2.locator('button[title="Delete Note"], button[title*="elete"]').count()) === 0);
await tab2.close();

// T4: wall delete failure rollback + success + tombstone anti-resurrection
await page.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
// post a wall note via API (fast fixture) then reload to render from server
await fetch(base + '/api/archives/' + id + '/wall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: 'QA', authorRole: 'Classmate', text: 'Wall note to delete', cardStyle: 'polaroid' }) });
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
const wallNav = page.getByRole('button', { name: /memory wall|the wall/i }).first();
if (await wallNav.count()) { await wallNav.click(); await page.waitForTimeout(1200); }
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1500);
const wallTextProbe = page.getByText('Wall note to delete').last();
await wallTextProbe.waitFor({ state: 'attached', timeout: 15000 });
await wallTextProbe.scrollIntoViewIfNeeded();
let wall = await getWall();
const wallId = wall.find(p => p.text === 'Wall note to delete')?.id;
check('T4a wall fixture posted server-side', Boolean(wallId));
// fail the DELETE
await page.route('**/api/archives/*/wall/*', r => r.request().method() === 'DELETE' ? r.abort() : r.continue());
const card = page.getByText('Wall note to delete').first();
// open moderation: owner session - find delete button on that card
const cardEl = page.locator('div:has(> :text("Wall note to delete"))').last();
const delWallBtn = page.locator('button[title="Delete note permanently"]').first();
await delWallBtn.click(); await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Yes' }).click(); await page.waitForTimeout(2000);
const restoredVisible = await page.getByText('Wall note to delete').count();
wall = await getWall();
check('T4b failed wall delete: post restored in UI', restoredVisible > 0, 'visible=' + restoredVisible);
check('T4c failed wall delete: still on server', wall.some(p => p.id === wallId));
const errToast = await page.locator('text=/could not delete/i').count();
check('T4d error toast on failed wall delete', errToast > 0);
await page.screenshot({ path: '/tmp/ui-shots/fix-04-wall-delete-rollback.png' });
await page.unroute('**/api/archives/*/wall/*');
// now delete for real
await page.locator('button[title="Delete note permanently"]').first().click(); await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Yes' }).click(); await page.waitForTimeout(2000);
wall = await getWall();
check('T4e real wall delete persisted server-side', !wall.some(p => p.id === wallId));
// plant the deleted post in localStorage (simulating stale cache) then reload - must NOT resurrect
await page.evaluate(([aid, pid, text]) => {
  const k = 'archive_wall_' + aid;
  localStorage.setItem(k, JSON.stringify([{ id: pid, authorName: 'QA', authorRole: 'Classmate', text, cardStyle: 'polaroid', createdAt: new Date().toISOString() }]));
}, [id, wallId, 'Wall note to delete']);
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
const wallNav3 = page.getByRole('button', { name: /memory wall|the wall/i }).first();
if (await wallNav3.count()) { await wallNav3.click(); await page.waitForTimeout(1200); }
await page.locator('#section-memory-wall, [id*="memory-wall"]').first().scrollIntoViewIfNeeded().catch(() => {});
const resurrected = await page.getByText('Wall note to delete').count();
check('T4f tombstoned post NOT resurrected from stale localStorage', resurrected === 0, 'visible=' + resurrected);
// cross-tab check
const tab3 = await ctx.newPage();
await tab3.goto(base + '/s/' + slug, { waitUntil: 'domcontentloaded' }); await tab3.waitForTimeout(3500);
const wallNav4 = tab3.getByRole('button', { name: /memory wall|the wall/i }).first();
if (await wallNav4.count()) { await wallNav4.click(); await tab3.waitForTimeout(1200); }
check('T4g wall note gone in fresh tab', (await tab3.getByText('Wall note to delete').count()) === 0);
await tab3.close();

await b.close();
const fails = results.filter(r => !r.ok);
console.log('\n==== ' + (results.length - fails.length) + '/' + results.length + ' passed ====');
process.exit(fails.length ? 1 : 0);
