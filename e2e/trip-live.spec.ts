// Trip-day features: "now / next" on the home screens, last-minute programme changes, the organizer's status strip.
import { test, expect, openTrip, TRIP as T, type Db } from './helpers';
import type { Page } from '@playwright/test';

async function seed(db: Db) {
  const put = (p: string, d: object) => db.put(`${T}/${p}`, d);
  await put('settings/trip', { team: ['שלומי', 'איציק', 'יעל'] });
  await put('tasks/t1', { title: 'להזמין אוטובוס', owner: 'שלומי', status: 'לביצוע', priority: 'רגילה', category: 'אוטובוס', due: '2026-10-01', notes: '', order: 1 });
  await put('participants/p1', { name: 'אבי כהן', amount: 1750, phone: '0501234567', status: 'שולם', passport: true, order: 1 });
  await put('participants/p2', { name: 'בני לוי', amount: 1750, phone: '0502345678', status: 'לא שולם', passport: false, order: 2 });
  await put('settings/req_1', { kind: 'req', by: 'p2', cat: 'אוכל', text: 'מנה צמחונית', status: 'חדש', ts: 1 });
}
const asGuest = async (page: Page, id = 'p1') => {
  await page.evaluate(i => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:' + i); }, id);
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
};

test('LIVE-1 an organizer moves an item in the programme; participants see the new time, marked updated, and get a message', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('more',{sub:'program'})");
  await page.locator('.seg').getByRole('button', { name: 'שישי' }).click();
  await page.getByRole('button', { name: /^שינוי: .*טועמיה/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('במקור: 13:00');
  await sheet.getByLabel('שעה').fill('13:30');
  await sheet.getByRole('button', { name: 'עדכון לכולם' }).click();
  await expect.poll(async () => (await db.get(`${T}/settings/prog`))?.fix?.fri_2?.tm).toBe('13:30');
  await expect.poll(async () => (await db.list(`${T}/settings`)).find((d: any) => d.data.kind === 'ann')?.data.text).toContain('במקום 13:00, עכשיו ב־13:30');
  // marked as a programme change, so the server sends it as a phone notification that opens the programme
  expect((await db.list(`${T}/settings`)).find((d: any) => d.data.kind === 'ann')?.data.prog).toBe('fri_2');
  const item = page.locator('.parch .pi', { hasText: 'טועמיה' });
  await expect(item).toContainText('עודכן');
  await expect(item.locator('s')).toHaveText('13:00');
  // the participant's programme shows it too, without an edit button
  const guest = await openTrip(browser, db);
  await asGuest(guest.page);
  await guest.page.evaluate("GTAB='gl';V.filter.pd='fri';render(true)");
  const gItem = guest.page.locator('.parch .pi', { hasText: 'טועמיה' });
  await expect(gItem).toContainText('13:30');
  await expect(gItem).toContainText('עודכן');
  await expect(guest.page.locator('.pedit')).toHaveCount(0);
  // back to the original
  await page.getByRole('button', { name: /^שינוי: .*טועמיה/ }).click();
  await sheet.getByRole('button', { name: 'חזרה למקור' }).click();
  await expect.poll(async () => (await db.get(`${T}/settings/prog`))?.fix?.fri_2).toBeUndefined();
  expect(errors).toEqual([]);
  expect(guest.errors).toEqual([]);
});

test('NOW-1 during the trip the home screens say what is happening now and next, by Budapest time', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  // Friday 20.11, 12:40 in Budapest (the phone may be on Israel time: the card follows Budapest)
  await page.clock.setFixedTime(new Date('2026-11-20T12:40:00+01:00'));
  await page.evaluate("go('home')");
  const card = page.locator('.nowc');
  await expect(card).toContainText('יום שישי במסע');
  await expect(card.locator('.nc-row.now')).toContainText('זמן חופשי');
  await expect(card.locator('.nc-row.next')).toContainText('13:00 · בעוד 20 דק׳');
  await expect(card.locator('.nc-row.next')).toHaveClass(/soon/);
  await card.getByRole('button', { name: /כל התוכנית של היום/ }).click();
  await expect(page.locator('.parch')).toContainText('יום שישי');
  // participant
  await asGuest(page);
  await expect(page.locator('.nowc .nc-row.next')).toContainText('טועמיה');
  // on a trip day the participant's home shows today's essentials instead of payment and passport
  const today = page.getByRole('region', { name: 'היום במסע' });
  await expect(today).toContainText('הדלקת נרות');
  await expect(today).toContainText('15:45');
  // a day that isn't a trip day: no card
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+01:00'));
  await page.evaluate('render(true)');
  await expect(page.locator('.nowc')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('KPI-1 the organizer home opens with the status strip; each number leads to its screen', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('home')");
  const strip = page.getByRole('region', { name: 'תמונת מצב' });
  await expect(strip.getByRole('button', { name: /נגבה ממשתתפים/ })).toContainText('50%');
  await expect(strip.getByRole('button', { name: /דרכונים/ })).toContainText('1/2');
  await expect(strip.getByRole('button', { name: /בקשה מחכה/ })).toContainText('1');
  await expect(strip.getByRole('button', { name: /משימות באיחור/ })).toContainText('1');
  await strip.getByRole('button', { name: /בקשה מחכה/ }).click();
  await expect(page.locator('.page-title')).toContainText('בקשות ואישורים');
  await page.evaluate("go('home')");
  await page.getByRole('region', { name: 'פעולות מהירות' }).getByRole('button', { name: 'הודעה לכולם' }).click();
  await expect(page.locator('.page-title')).toContainText('הודעות לכולם');
  expect(errors).toEqual([]);
});

test('HELP-1 participants can reach the organizer from the home screen', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  await asGuest(page);
  const help = page.getByRole('region', { name: 'עזרה' });
  await expect(help.getByRole('link', { name: 'שיחה לשלומי' })).toHaveAttribute('href', /^tel:/);
  await expect(help.getByRole('link', { name: 'וואטסאפ לשלומי' })).toHaveAttribute('href', /^https:\/\/wa\.me\/972/);
  await expect(help.getByRole('link', { name: 'חירום 112' })).toHaveAttribute('href', 'tel:112');
  expect(errors).toEqual([]);
});

test('MOTION-1 with motion on, numbers roll to a changed value and a quick flick down closes a sheet', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  expect(await page.evaluate('typeof gsap')).toBe('object');
  await page.evaluate("go('home')");
  const paid = page.getByRole('region', { name: 'תמונת מצב' }).getByRole('button', { name: /נגבה ממשתתפים/ }).locator('.num');
  await expect(paid).toHaveText('50%');
  // another phone marks the second participant as paid: the number rolls up instead of jumping
  await db.put(`${T}/participants/p2`, { name: 'בני לוי', amount: 1750, phone: '0502345678', status: 'שולם', passport: false, order: 2 });
  const seen = await page.evaluate(() => new Promise<string[]>(ok => {
    const el = document.querySelector('.kpi .num')!, out: string[] = [];
    const mo = new MutationObserver(() => out.push(el.textContent || ''));
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    setTimeout(() => { mo.disconnect(); ok(out) }, 1200);
  }));
  expect(seen.some(t => t !== '50%' && t !== '100%')).toBe(true);
  await expect(paid).toHaveText('100%');
  // open a task and flick it closed: 40px fast is enough
  await page.evaluate("go('tasks')");
  await page.locator('.row .main').first().click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  await sheet.evaluate(sh => {
    const t = (y: number) => [new Touch({ identifier: 1, target: sh, clientY: y, clientX: 100 })];
    sh.dispatchEvent(new TouchEvent('touchstart', { touches: t(300), changedTouches: t(300) }));
    sh.dispatchEvent(new TouchEvent('touchmove', { touches: t(340), changedTouches: t(340) }));
    sh.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: t(340) }));
  });
  await expect(page.locator('.scrim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ZMAN-1 the programme shows the zmanim of the day for Budapest; the full list opens, and the pocket guide has the taxi card', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  await asGuest(page);
  await page.evaluate("GTAB='gl';V.filter.pd='fri';render(true)");
  const z = page.locator('.zst');
  // sunset in Budapest on 20.11.2026 is 16:03; candles at 15:45 in the programme are 18 minutes before it
  await expect(z).toContainText('16:03');
  await expect(z).toContainText('18 דקות לפני השקיעה');
  await z.getByRole('button', { name: /כל הזמנים/ }).click();
  const sh = page.getByRole('dialog');
  await expect(sh).toContainText('עלות השחר');
  await sh.getByRole('button', { name: 'שבת' }).click();
  await expect(sh).toContainText('צאת השבת · רבנו תם');
  await expect(sh).toContainText('17:14');
  await sh.getByRole('button', { name: 'סגירה' }).click();
  await page.evaluate("GTAB='gk';render(true)");
  await page.locator('#taxiBtn').click();
  await expect(page.getByRole('dialog')).toContainText('Kérem, vigyen el ide:');
  expect(errors).toEqual([]);
});

test('SYNC-1 the same numbers on every tab: collected %, waiting requests; the team schedule shows the programme', async ({ browser, db }) => {
  await seed(db);
  // a partial payment and an exempt rabbi: collected = 1,750 + 500 out of 3,500 owed by payers = 64%
  await db.put(`${T}/participants/p2`, { name: 'בני לוי', amount: 1750, phone: '0502345678', status: 'שולם חלקית', paidAmt: 500, passport: false, order: 2 });
  await db.put(`${T}/participants/p3`, { name: 'הרב גדליה', amount: 2000, phone: '0503456789', status: 'פטור', passport: true, order: 3 });
  await db.put(`${T}/settings/req_2`, { kind: 'req', by: 'p1', cat: 'חדר', text: 'קומה נמוכה', status: 'בטיפול', ts: 2 });
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('home')");
  const strip = page.getByRole('region', { name: 'תמונת מצב' });
  await expect(strip.getByRole('button', { name: /נגבה ממשתתפים/ })).toContainText('64%');
  await expect(strip.getByRole('button', { name: /בקשה מחכה/ })).toContainText('1');
  await page.evaluate("go('money',{seg:'participants'})");
  await expect(page.locator('#view')).toContainText('נגבה 64%');
  await page.evaluate("go('more',{sub:'reqs'})");
  await expect(page.locator('.page-title .cnt')).toHaveText('1');
  await expect(page.locator('#view')).toContainText('1 חדשות · 1 בטיפול');
  // the team schedule on Friday includes the participants' lunch, marked as part of the programme
  await page.evaluate("go('sched',{seg:'יום שישי'})");
  const lunch = page.locator('.row.prow-p', { hasText: 'טועמיה' });
  await expect(lunch).toContainText('בתוכנית');
  await lunch.click();
  await expect(page.getByRole('dialog')).toContainText('שינוי בלוח המסע');
  expect(errors).toEqual([]);
});
