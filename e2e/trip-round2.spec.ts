// Participant and organizer features: check-in task, personal messages, tasks for everyone, shared rides, photos, the organizer's tile order.
import { test, expect, openTrip, TRIP as T, type Db } from './helpers';
import type { Browser, Page } from '@playwright/test';

async function seed(db: Db) {
  const put = (p: string, d: object) => db.put(`${T}/${p}`, d);
  await put('settings/trip', { team: ['שלומי', 'איציק', 'יעל'] });
  await put('participants/p1', { name: 'אבי כהן', amount: 1750, phone: '0501234567', status: 'שולם', passport: true, outbound: 'קבוצתי', returnGroup: 'מוצ״ש', order: 1 });
  await put('participants/p2', { name: 'בני לוי', amount: 1750, phone: '0502345678', status: 'לא שולם', outbound: 'קבוצתי', returnGroup: 'מוצ״ש', order: 2 });
  await put('participants/p3', { name: 'גלעד מור', amount: 1750, phone: '0503456789', status: 'שולם', passport: true, outbound: 'קבוצתי', returnGroup: 'ראשון ערב', order: 3 });
  await put('flights/f1', { label: 'קבוצתי', dir: 'הלוך', group: 'קבוצתי', flightNo: 'LY 2369', date: '2026-11-19', dep: '08:40', arr: '11:15' });
}

async function guest(browser: Browser, db: Db, id: string, at?: string): Promise<Page> {
  const { page } = await openTrip(browser, db);
  if (at) await page.clock.setFixedTime(new Date(at));
  await page.evaluate(i => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:' + i); }, id);
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  await expect(page.locator('body.guest')).toHaveCount(1);
  return page;
}
const tab = (page: Page, t: string) => page.evaluate(`GTAB='${t}';render(true)`);

test('check-in: a task 24 hours before the flight, gone once done', async ({ browser, db }) => {
  await seed(db);
  // two days before: nothing yet
  let page = await guest(browser, db, 'p2', '2026-11-17T08:00:00+02:00');
  await expect(page.locator('.gtask.ci')).toHaveCount(0);
  await page.context().close();
  // the evening before the 08:40 flight
  page = await guest(browser, db, 'p2', '2026-11-18T20:00:00+02:00');
  await expect(page.locator('#view .gtask.ci')).toContainText('צ׳ק־אין');
  await page.locator('#view [data-g-ci]').first().click();
  await expect.poll(async () => (await db.get(`${T}/participants/p2`))?.ciDone).toBe('f1');
  await expect(page.locator('#view .ghome .gtask.ci')).toHaveCount(0);
  await tab(page, 'gt');
  await page.locator('[data-gseg2="mine"]').click();
  await expect(page.locator('.gtask.ci.done')).toHaveCount(1);
});

test('messages: a personal message reaches only its person; a task for everyone is marked per person', async ({ browser, db }) => {
  await seed(db);
  await db.put(`${T}/settings/ann_9`, { kind: 'ann', title: 'רק לבני', text: 'שלום בני', ts: Date.now(), to: ['p2'], toName: 'בני לוי' });
  await db.put(`${T}/settings/gtask_1`, { kind: 'gtask', title: 'להביא תהילים', text: '', ts: Date.now(), done: {} });
  const p2 = await guest(browser, db, 'p2');
  await tab(p2, 'gm');
  await expect(p2.locator('.ann.personal')).toContainText('רק לבני');
  const p1 = await guest(browser, db, 'p1');
  await tab(p1, 'gm');
  await expect(p1.locator('#view')).not.toContainText('רק לבני');
  await tab(p1, 'gt');
  await p1.locator('[data-gseg2="mine"]').click();
  await p1.locator('[data-g-gt="gtask_1"]').click();
  await expect.poll(async () => (await db.get(`${T}/settings/gtask_1`))?.done).toEqual({ p1: true });
});

test('organizers: personal message and a task for everyone from the messages screen', async ({ browser, db }) => {
  await seed(db);
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('role', 'org'); });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  // the home tiles start with passports, participants and tasks
  await expect(page.locator('.cubes.tiles .cube b').nth(0)).toHaveText('דרכונים');
  await expect(page.locator('.cubes.tiles .cube b').nth(1)).toHaveText('משתתפים');
  await expect(page.locator('.cubes.tiles .cube b').nth(2)).toHaveText('משימות');
  await page.locator('.cubes.tiles .cube').nth(2).click();
  await expect.poll(() => page.evaluate('V.tab')).toBe('tasks');
  await page.evaluate(`go('more',{sub:'announce'})`);
  await page.locator('[data-ann-mode="one"]').click();
  await page.locator('#annTo').selectOption('p3');
  await page.locator('#annText').fill('נפגשים בלובי');
  await page.locator('[data-ann-pub]').click();
  await expect.poll(async () => (await db.list(`${T}/settings`)).find((d: any) => d.data.text === 'נפגשים בלובי')?.data.to).toEqual(['p3']);
  await page.locator('[data-ann-mode="task"]').click();
  await page.locator('#annTitle').fill('לעשות צ׳ק־אין');
  await page.locator('[data-ann-pub]').click();
  await expect.poll(async () => (await db.list(`${T}/settings`)).some((d: any) => d.data.kind === 'gtask' && d.data.title === 'לעשות צ׳ק־אין')).toBe(true);
  await expect(page.locator('#view')).toContainText('0/3 סיימו');
});

test('rides: one posts a car, another joins', async ({ browser, db }) => {
  await seed(db);
  const p1 = await guest(browser, db, 'p1');
  await tab(p1, 'gd');
  await p1.locator('[data-rform="car"]').click();
  await p1.locator('#rdFrom').fill('בני ברק');
  await p1.locator('#rdTime').fill('05:15');
  await p1.locator('[data-ride-pub]').click();
  await expect(p1.locator('.rd-c.mine')).toContainText('בני ברק');
  const p3 = await guest(browser, db, 'p3');
  await tab(p3, 'gd');
  await p3.locator('[data-ride-join]').click();
  await expect.poll(async () => (await db.list(`${T}/settings`)).find((d: any) => d.data.kind === 'ride')?.data.join).toEqual(['p3']);
  await expect(p3.locator('.rd-c.in')).toContainText('גלעד מור');
});

test('photos: upload one, it shows in the gallery and opens', async ({ browser, db }) => {
  await seed(db);
  const page = await guest(browser, db, 'p1');
  await tab(page, 'gi');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#phFile').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('.ph-c')).toHaveCount(1);
  expect((await db.list(`${T}/photobig`)).length).toBe(1);
  await page.locator('.ph-c').click();
  await expect(page.locator('#phv')).toContainText('אבי כהן');
  await expect(page.locator('#phv [data-phv-del]')).toHaveCount(1);
});
