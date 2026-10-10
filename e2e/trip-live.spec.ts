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
  await expect(page.locator('.cubes.tiles').getByRole('button', { name: /דרכונים/ })).toContainText('1/2');
  await expect(page.locator('.cubes.tiles').getByRole('button', { name: /בקשות ואישורים/ })).toContainText('1 ממתינות');
  // late tasks are on the big tasks card under the strip
  await expect(page.getByRole('region', { name: 'עבודה שוטפת' }).getByRole('button', { name: /משימות/ })).toContainText('1 באיחור');
  await page.locator('.cubes.tiles').getByRole('button', { name: /בקשות ואישורים/ }).click();
  await expect(page.locator('.page-title')).toContainText('בקשות ואישורים');
  await page.evaluate("go('home')");
  await page.getByRole('region', { name: 'פעולות מהירות' }).getByRole('button', { name: 'הודעה לכולם' }).click();
  await expect(page.locator('.page-title')).toContainText('הודעות');
  await expect(page.locator('.seg').getByRole('button', { name: /באפליקציה/ })).toHaveAttribute('aria-pressed', 'true');
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
    const el = document.querySelector('.fin .fc:nth-child(2) .num')!, out: string[] = [];
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
  await expect(page.locator('.cubes.tiles').getByRole('button', { name: /בקשות ואישורים/ })).toContainText('1 ממתינות');
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

test('PASS-1 the passport button on a participant opens the card: name in English, expiry with a warning, the photo link', async ({ browser, db }) => {
  await seed(db);
  await db.put(`${T}/participants/p1`, { name: 'אבי כהן', amount: 1750, phone: '0501234567', status: 'שולם', passport: true, nameEn: 'COHEN AVI', passExp: '2027-01-10', order: 1 });
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('more',{sub:'people'})");
  await page.getByRole('button', { name: 'הדרכון של אבי כהן' }).click();
  const sh = page.getByRole('dialog');
  await expect(sh).toContainText('COHEN AVI');
  await expect(sh).toContainText('10.1.2027');
  await expect(sh).toContainText('התוקף קצר מדי');
  await page.evaluate(() => { window.prompt = () => 'https://drive.google.com/file/d/xyz'; });
  await sh.getByRole('button', { name: 'הוספת קישור לצילום' }).click();
  await expect.poll(async () => (await db.get(`${T}/participants/p1`))?.passUrl).toBe('https://drive.google.com/file/d/xyz');
  await expect(page.getByRole('dialog').getByRole('link', { name: 'צפייה בצילום הדרכון' })).toHaveAttribute('href', 'https://drive.google.com/file/d/xyz');
  expect(errors).toEqual([]);
});

test('PCHECK-1 passport check: paste names and expiry, a short or expired one is flagged, inline edit, and the hotel list in English', async ({ browser, db }) => {
  await seed(db);
  await db.put(`${T}/participants/p3`, { name: 'גדי לוי', amount: 1750, phone: '0503456789', status: 'שולם', passport: true, order: 3 });
  await db.put(`${T}/participants/p4`, { name: 'שלמה זלמן ברסקי', amount: 1750, phone: '0504567890', status: 'שולם', passport: false, order: 4 });
  await db.put(`${T}/rooms/r1`, { occupants: 'אבי כהן, בני לוי', roomNumber: '401', floor: '4', order: 1 });
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('more',{sub:'passports'})");
  await expect(page.locator('#view')).toContainText('בדיקת דרכונים');
  // paste: one fine, one expired, one too short; one name that isn't in the trip
  await page.getByRole('button', { name: /הדבקת נתונים/ }).click();
  const sh = page.getByRole('dialog');
  await sh.locator('#imTxt').fill('אבי כהן | cohen avi | 2031-05-14\nבני לוי | LEVI BENI | 2025-08-10\nגדי לוי | LEVI GADI | 2027-01-05\nמישהו שלא קיים | NOBODY | 2030-01-01');
  // the check runs on its own, before anything is pressed
  await expect(sh.locator('#imOut')).toContainText('3 נמצאו');
  await expect(sh.locator('#imOut')).toContainText('1 לא זוהו');
  // an unrecognised line can be assigned by hand from a list (e.g. the app has Shlomo, the passport says Shlomo Zalman)
  await sh.locator('.imsel').selectOption({ label: 'שלמה זלמן ברסקי' });
  await expect(sh.locator('#imOut')).toContainText('4 נמצאו');
  await sh.locator('.imsel').count().then(n => expect(n).toBe(0));
  await sh.getByRole('button', { name: 'בדיקה ועדכון' }).click();
  await expect.poll(async () => (await db.get(`${T}/participants/p1`))?.nameEn).toBe('COHEN AVI');
  await expect.poll(async () => (await db.get(`${T}/participants/p2`))?.passExp).toBe('2025-08-10');
  await expect.poll(async () => (await db.get(`${T}/participants/p4`))?.nameEn).toBe('NOBODY');
  await page.evaluate("go('more',{sub:'passports'})");
  await expect(page.locator('.pcrow', { hasText: 'בני לוי' })).toContainText('פג תוקף');
  await expect(page.locator('.pcrow', { hasText: 'גדי לוי' })).toContainText('תוקף קצר');
  await expect(page.locator('.pcrow', { hasText: 'אבי כהן' })).toHaveCount(0); // the default filter shows only the problems
  // fix one inline: the new date is valid, the flag goes away
  await page.locator('.pcrow', { hasText: 'גדי לוי' }).locator('[data-pce="passExp"]').fill('2031-01-05');
  await page.locator('.pcrow', { hasText: 'גדי לוי' }).locator('[data-pce="passExp"]').blur();
  await expect.poll(async () => (await db.get(`${T}/participants/p3`))?.passExp).toBe('2031-01-05');
  // an expired passport shows on the home strip, and the strip opens the problems
  await page.evaluate("go('home')");
  await expect(page.locator('#view')).toContainText('דרכונים שפג תוקפם');
  await page.locator('.cubes.tiles').getByRole('button', { name: /דרכונים/ }).click();
  await expect(page.locator('.pcrow', { hasText: 'בני לוי' })).toContainText('פג תוקף');
  // the hotel list: the room with the English names as in the passports
  await page.getByRole('button', { name: /רשימה למלון/ }).click();
  await expect(page.getByRole('dialog').locator('#hotelTxt')).toHaveValue(/Room 401 \(floor 4\): COHEN AVI \/ LEVI BENI/);
  expect(errors).toEqual([]);
});

test('SETS-1 the person who arranges the rooms marks them from his own screen, and the rooms screen and the kits screen follow', async ({ browser, db }) => {
  await seed(db);
  await db.put(`${T}/participants/p1`, { name: 'אבי כהן', amount: 1750, phone: '0501234567', status: 'שולם', passport: true, kitter: true, order: 1 });
  await db.put(`${T}/rooms/r1`, { occupants: 'בני לוי', roomNumber: '401', floor: '4', order: 1 });
  await db.put(`${T}/rooms/r2`, { occupants: 'דני דן', roomNumber: '402', floor: '4', order: 2 });
  await db.put(`${T}/packing/k1`, { item: 'כוס זכוכית', list: 'סט לכל חדר', qty: 2, per: 1, cost: 10, ordered: true, arrived: true, packed: true, placed: false, order: 1 });
  const org = await openTrip(browser, db);
  const day = new Date('2026-11-19T20:00:00+01:00');
  await org.page.clock.setFixedTime(day);
  await org.page.evaluate("go('more',{sub:'kits'});V.filter.kit='ערכה לחדר';render(true)");
  await expect(org.page.locator('.kroom')).toContainText('0');
  // the person who arranges the rooms (a participant) opens his own screen
  const g = await openTrip(browser, db);
  await g.page.clock.setFixedTime(day);
  await asGuest(g.page, 'p1');
  await g.page.evaluate("GTAB='gs';render(true)");
  await expect(g.page.locator('.gsh')).toContainText('0');
  await g.page.locator('.gsr', { hasText: '401' }).click();
  await expect.poll(async () => (await db.get(`${T}/rooms/r1`))?.kitReady).toBe(true);
  expect((await db.get(`${T}/rooms/r1`))?.kitBy).toBe('אבי כהן');
  // someone who is not marked as arranging the rooms has no such card on his home
  const o = await openTrip(browser, db);
  await o.page.clock.setFixedTime(day);
  await asGuest(o.page, 'p2');
  await expect(o.page.locator('.gc', { hasText: 'סידור ערכות בחדרים' })).toHaveCount(0);
  // the organizer's rooms screen and kits screen show the same progress
  await org.page.evaluate("go('more',{sub:'rooms'})");
  await expect(org.page.locator('#view')).toContainText('1/2 עם סט');
  await expect(org.page.locator('.row', { hasText: 'בני לוי' })).toContainText('אבי');
  await org.page.evaluate("go('more',{sub:'kits'});V.filter.kit='ערכה לחדר';render(true)");
  await expect(org.page.locator('.kroom')).toContainText('1');
  await expect(org.page.locator('.kroom')).toContainText('2');
  expect(org.errors).toEqual([]); expect(g.errors).toEqual([]); expect(o.errors).toEqual([]);
});

test('KERES-1 the Kerestir page: who he was, the tomb, today\'s programme from the schedule; on Thursday the trip-day home leads to it', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  await page.clock.setFixedTime(new Date('2026-11-19T09:30:00+01:00'));
  await asGuest(page);
  await page.getByRole('region', { name: 'היום במסע' }).getByRole('button', { name: /קרעסטיר/ }).click();
  const v = page.locator('#view');
  await expect(v).toContainText('רבי ישעיה׳לה מקרעסטיר');
  await expect(v).toContainText('ג׳ באייר ה׳תרפ״ה');
  await expect(v.locator('.kzt')).toContainText('סעודת הישועות');
  await page.getByRole('button', { name: /חזרה למסך הבית/ }).first().click();
  await expect(page.getByRole('region', { name: 'היום במסע' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('SYNC-2 two organizers on two phones: a change on one shows on the other, and both compute the same numbers', async ({ browser, db }) => {
  await seed(db);
  await db.put(`${T}/expenses/e1`, { name: 'אוטובוס', estimate: 10000, paid: 0, category: 'תחבורה', status: 'לא שולם', final: true, receipt: false, order: 1 });
  await db.put(`${T}/rooms/r1`, { roomNumber: '400', floor: '4', occupants: 'אבי כהן', order: 1 });
  const A = await openTrip(browser, db, 'שלומי'), B = await openTrip(browser, db, 'איציק');
  for (const p of [A.page, B.page]) await expect.poll(() => p.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  const act = (p: Page, js: string) => p.evaluate(js);
  await act(A.page, "save('participants','p2',{...strip(find('participants','p2')),status:'שולם'})");
  await act(A.page, "save('expenses','e1',{...strip(find('expenses','e1')),status:'מקדמה',paid:4000})");
  await act(A.page, "save('rooms','r1',{...strip(find('rooms','r1')),kitReady:true,kitBy:'שלומי'})");
  await act(A.page, "save('donations','d1',{donor:'משפחת לוי',amount:1000,status:'התקבל',purpose:'כללי',order:1})");
  await act(A.page, "save('tasks','t2',{title:'לבדוק מיקרופון',owner:'איציק',status:'לביצוע',priority:'רגילה',category:'אחר',order:2})");
  const snap = (p: Page) => p.evaluate("JSON.stringify({m:money(),tasks:S.tasks.length,kit:S.rooms.filter(r=>r.kitReady).length,paid:S.participants.filter(x=>x.status==='שולם').length,don:S.donations.length})");
  await expect.poll(async () => JSON.parse(await snap(B.page)).paid).toBe(2);
  await expect.poll(() => snap(B.page)).toBe(await snap(A.page));
  const b = JSON.parse(await snap(B.page));
  expect(b.kit).toBe(1); expect(b.tasks).toBe(2); expect(b.don).toBe(1);
  // the screens agree too: the home strip and the money header read the same on both phones
  for (const p of [A.page, B.page]) await p.evaluate("go('money',{seg:'sum'})");
  await expect.poll(async () => (await B.page.locator('.money-top').innerText()).replace(/\s+/g, ' ')).toBe((await A.page.locator('.money-top').innerText()).replace(/\s+/g, ' '));
  // and the other way: B edits, A follows
  await act(B.page, "save('participants','p1',{...strip(find('participants','p1')),status:'לא שולם'})");
  await expect.poll(() => A.page.evaluate("find('participants','p1').status")).toBe('לא שולם');
  expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
});

test('MONEY-1 expenses and income: four tabs; income has payments and donations; one filter row each', async ({ browser, db }) => {
  await seed(db);
  const ex = (id: string, name: string, cat: string, status: string, paid: number, receipt: boolean, final = true) => db.put(`${T}/expenses/${id}`, { name, estimate: 1000, paid, category: cat, status, final, receipt, order: 1 });
  await ex('e1', 'אוטובוס', 'תחבורה', 'לא שולם', 0, false);
  await ex('e2', 'מלון', 'לינה', 'מקדמה', 400, false);
  await ex('e3', 'ארוחת שבת', 'אוכל', 'שולם', 1000, true);
  await ex('e4', 'נרות', 'אוכל', 'לא שולם', 0, false, false);
  await db.put(`${T}/donations/d1`, { donor: 'משפחת לוי', amount: 500, status: 'התקבל', purpose: 'כללי', order: 1 });
  await db.put(`${T}/donations/d2`, { donor: 'משפחת כהן', amount: 800, status: 'ממתין', purpose: 'סעודה', order: 2 });
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('money',{seg:'sum'})");
  await expect(page.locator('.seg.s4 button')).toHaveText([/סיכום/, /הכנסות/, /הוצאות/, /קופות/]);
  await page.locator('.seg.s4').getByRole('button', { name: /^הוצאות/ }).click();
  const rows = page.locator('#view .erow');
  await expect(rows).toHaveCount(4);
  await page.getByRole('button', { name: /^לא שולם במלואו/ }).click();
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: /^שולם/ }).click();
  await expect(rows).toHaveCount(1); await expect(rows).toContainText('ארוחת שבת');
  await page.getByRole('button', { name: /^לטיפול/ }).click();
  await expect(rows).toHaveCount(2); // an estimate, or paid without a receipt
  // income: payments and donations under one tab
  await page.locator('.seg.s4').getByRole('button', { name: /^הכנסות/ }).click();
  await expect(page.locator('.seg.s4 button[aria-pressed="true"]')).toContainText('הכנסות');
  await page.locator('.seg.sub').getByRole('button', { name: /^תרומות/ }).click();
  await expect(page.locator('.seg.s4 button[aria-pressed="true"]')).toContainText('הכנסות');
  const don = page.locator('#view .row[data-edit^="donations"]');
  await expect(don).toHaveCount(2);
  await page.getByRole('button', { name: /^ממתינות/ }).click();
  await expect(don).toHaveCount(1); await expect(don).toContainText('משפחת כהן');
  await page.locator('.seg.sub').getByRole('button', { name: /^משתתפים/ }).click();
  await expect(page.getByRole('button', { name: /^כולם/ })).toContainText('2');
  expect(errors).toEqual([]);
});

test('ROWS-1 participants list: quick buttons on each row (payment, passport, call, WhatsApp), no duplicate chips', async ({ browser, db }) => {
  await seed(db);
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('more',{sub:'people'})");
  const row = page.locator('.prow', { hasText: 'בני לוי' });
  await expect(row.getByRole('link', { name: /שיחה עם בני לוי/ })).toHaveAttribute('href', 'tel:0502345678');
  await expect(row.getByRole('link', { name: /וואטסאפ/ })).toBeVisible();
  await row.getByRole('button', { name: /תשלום של בני לוי/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'הדרכון של בני לוי' }).click();
  await expect(page.getByRole('dialog')).toContainText('בני לוי');
  await page.keyboard.press('Escape');
  // each filter appears once, and the passport-check shortcut shows with the passport filter instead of as a second chip
  const chips = await page.locator('.chips .chip').allInnerTexts();
  expect(new Set(chips).size).toBe(chips.length);
  expect(chips.join('|')).not.toContain('בדיקת דרכונים');
  await page.getByRole('button', { name: /^דרכון לא תקין/ }).click();
  await expect(page.getByRole('button', { name: /למסך בדיקת הדרכונים/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('SHOP-1 shopping: filter by country/Budapest and by urgent/last minute; room-set items show up too', async ({ browser, db }) => {
  await seed(db);
  const it = (id: string, d: object) => db.put(`${T}/packing/${id}`, { qty: 1, order: 1, ...d });
  await it('k1', { item: 'נרות', where: 'בארץ', prio: 'דחוף' });
  await it('k2', { item: 'מים', where: 'בבודפשט', prio: 'הרגע האחרון' });
  await it('k3', { item: 'שוקולד', where: 'בבודפשט' });
  await it('k4', { item: 'פחיות שתייה לחדרים', list: 'סט לכל חדר', kit: 'ערכה לחדר', prio: 'דחוף' });
  const { page, errors } = await openTrip(browser, db);
  await page.evaluate("go('more',{sub:'packing'})");
  const rows = page.locator('#view .row[data-edit^="packing"]');
  await expect(rows).toHaveCount(4);
  await expect(page.locator('#view')).toContainText('פחיות שתייה לחדרים');
  await page.getByRole('button', { name: /^🇭🇺 בבודפשט/ }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: /^⏳ הרגע האחרון/ }).click();
  await expect(rows).toHaveCount(1); await expect(rows).toContainText('מים');
  await page.getByRole('button', { name: /^🔥 דחוף/ }).click();
  await expect(page.locator('#view')).toContainText('אין פריטים בסינון הזה');
  await page.locator('.chips.own').filter({ hasText: 'איפה' }).getByRole('button', { name: /^הכל/ }).click(); // back to all places
  await expect(rows).toHaveCount(2); // the urgent ones: candles, and the cans for the rooms
  expect(errors).toEqual([]);
});
