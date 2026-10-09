// The trip management app (/trip): money, payments, delete and restore, backup, export and offline.
// Each test seeds its own trip in the fake Firestore (or the emulator with firestore.rules, npm run test:rules).
import { test, expect, a11y, openTrip, TRIP_AXE_SKIP, TRIP as T, TRIP_KEY as KEY, type Db } from './helpers';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

/** A small trip: 4 participants (paid, part paid, unpaid, exempt), 2 expenses, 2 donations. */
async function seed(db: Db) {
  const put = (p: string, d: object) => db.put(`${T}/${p}`, d);
  await put('settings/trip', { team: ['שלומי', 'איציק', 'יעל'] });
  await put('settings/claude', { applied: ['b1'] });
  await put('tasks/t1', { title: 'להזמין אוטובוס', owner: 'שלומי', status: 'לביצוע', priority: 'רגילה', category: 'אוטובוס', due: '', notes: '', order: 1 });
  await put('participants/p1', { name: 'אבי כהן', amount: 1750, phone: '0501234567', status: 'שולם', method: 'העברה לאיציק', holder: 'איציק', order: 1 });
  await put('participants/p2', { name: 'בני לוי', amount: 1750, phone: '0502345678', status: 'שולם חלקית', paidAmt: 500, holder: 'שלומי', order: 2 });
  await put('participants/p3', { name: 'גלעד מור', amount: 1750, phone: '0503456789', status: 'לא שולם', order: 3 });
  await put('participants/p4', { name: 'דוד פז', amount: 1750, status: 'פטור', order: 4 });
  await put('expenses/e1', { name: 'מלון', category: 'לינה', estimate: 5000, paid: 2000, status: 'מקדמה', paidBy: 'איציק', receipt: true, order: 1 });
  await put('expenses/e2', { name: 'אוטובוס לקרעסטיר', category: 'אוטובוס', estimate: 1000, paid: 1000, status: 'שולם', paidBy: 'יעל', receipt: false, order: 2 });
  await put('donations/d1', { donor: 'משפחת רוזן', amount: 1000, status: 'התקבל', holder: 'שלומי', purpose: 'כללי', order: 1 });
  await put('donations/d2', { donor: 'קרן חסד', amount: 500, status: 'התחייב', purpose: 'כללי', order: 2 });
}

const nav = (page: Page, name: string) => page.locator('#nav').getByRole('button', { name }).click();
const sheet = (page: Page) => page.getByRole('dialog');
const sub = (page: Page, name: string) => page.evaluate(n => (window as any).go('more', { sub: n }), name);
const settings = (page: Page) => sub(page, 'settings');
const participants = async (page: Page) => { await nav(page, 'כסף'); await page.locator('.seg').getByRole('button', { name: /^משתתפים/ }).click(); };

test.describe('trip app', () => {
  test.afterEach(async ({ db }) => {
    if ('failures' in db) expect(db.failures, 'writes that failed').toEqual([]);
  });

  test('M01-H1 the money screen counts partial payments, donations and expenses', async ({ browser, db }) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await participants(page);
    // in hand: 1750 + 500 (part) + 1000 (donation)
    // exempt participants count as income too (their share is covered from the fund): 4×1750 + 1500 − 6000 = +2,500
    await expect(page.locator('.money-top .bal')).toHaveText('+2,500 ₪');
    await expect(page.locator('.money-top')).toContainText('כבר בקופה3,250 ₪');
    await expect(page.locator('.row', { hasText: 'בני לוי' })).toContainText('500 ₪ / 1,750 ₪');
    expect(await a11y(page, undefined, TRIP_AXE_SKIP)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('M02-H1 cash boxes: who holds what, who paid from his own pocket, and a count that shows a gap', async ({ browser, db }) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await nav(page, 'כסף');
    await page.getByRole('button', { name: /^קופות/ }).click();
    const shlomi = page.getByRole('button', { name: /^ש שלומי/ }), itzik = page.getByRole('button', { name: /^א איציק/ });
    await expect(shlomi).toContainText('נכנס 1,500 ₪ · יצא 0 ₪');
    await expect(itzik).toContainText('נכנס 1,750 ₪ · יצא 2,000 ₪');
    await expect(itzik).toContainText('−250 ₪');
    await expect(page.getByText('יעל שילמה מכיסה · להחזיר לה')).toBeVisible();
    // Shlomi counts 1,400 in hand: the app holds 1,500, so 100 is missing
    await page.getByRole('button', { name: 'ספירת קופה' }).click();
    await sheet(page).getByLabel(/אצל שלומי בפועל/).fill('1400');
    await sheet(page).getByRole('button', { name: 'שמירה' }).click();
    await expect(shlomi).toContainText('פער בספירה: −100 ₪');
    await expect.poll(async () => (await db.get(`${T}/settings/cash`))?.counts?.['שלומי']?.amt).toBe(1400);
    expect(await a11y(page, undefined, TRIP_AXE_SKIP)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('M03-H1 recording a partial payment asks how much, and the cash box counts it', async ({ browser, db }) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await participants(page);
    await page.locator('.row', { hasText: 'גלעד מור' }).getByRole('button', { name: 'רישום תשלום' }).click();
    await sheet(page).getByRole('button', { name: 'שילם חלק' }).click();
    await sheet(page).getByLabel('כמה שולם עד עכשיו (₪)').fill('800');
    await sheet(page).getByRole('button', { name: 'שמירה' }).click();
    await expect.poll(async () => (await db.get(`${T}/participants/p3`))?.paidAmt).toBe(800);
    expect((await db.get(`${T}/participants/p3`))!.status).toBe('שולם חלקית');
    await expect(page.locator('.money-top')).toContainText('כבר בקופה4,050 ₪');
    // paying the rest in full marks it paid
    await page.locator('.row', { hasText: 'גלעד מור' }).getByRole('button', { name: 'שולם חלקית' }).click();
    await sheet(page).getByRole('button', { name: 'העביר לאיציק' }).click();
    await expect.poll(async () => (await db.get(`${T}/participants/p3`))?.status).toBe('שולם');
    expect((await db.get(`${T}/participants/p3`))!.paidAmt).toBe(1750);
    expect(errors).toEqual([]);
  });

  test('M04-H1 the WhatsApp reminder asks only for what is still owed', async ({ browser, db }) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await participants(page);
    await page.getByRole('button', { name: 'תזכורת בוואטסאפ' }).click();
    await expect(sheet(page)).toContainText('2 לא שילמו · 3,000 ₪');
    const link = sheet(page).getByRole('link', { name: 'וואטסאפ' }).first();
    expect(decodeURIComponent((await link.getAttribute('href'))!)).toContain('1,250 ₪');
    expect(errors).toEqual([]);
  });

  test('D01-H1 a deleted record goes to "deleted lately" and comes back with one tap', async ({ browser, db }) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await nav(page, 'כסף');
    await page.getByRole('button', { name: /^הוצאות/ }).click();
    await page.getByRole('button', { name: /^מלון/ }).click();
    await sheet(page).getByRole('button', { name: 'מחיקה' }).click();
    await sheet(page).getByRole('button', { name: 'לחצו שוב למחיקה' }).click();
    await expect.poll(() => db.get(`${T}/expenses/e1`)).toBeUndefined();
    expect((await db.get(`${T}/trash/expenses__e1`))!.data.estimate).toBe(5000);
    await settings(page);
    const row = page.locator('.row', { hasText: 'מלון' });
    await expect(row).toContainText('הוצאה');
    await row.getByRole('button', { name: 'שחזור' }).click();
    await expect.poll(async () => (await db.get(`${T}/expenses/e1`))?.paid).toBe(2000);
    await expect(page.getByText('לא נמחק כלום')).toBeVisible();
    expect(await a11y(page, undefined, TRIP_AXE_SKIP)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('D01-N1 deleting without a copy in trash is refused by the rules; the log and trash cannot be deleted', async ({ browser, db }) => {
    test.skip(!process.env.FIRESTORE_EMULATOR_HOST, 'needs the Firestore emulator: npm run test:rules');
    await seed(db);
    await db.put(`${T}/activity/a1`, { by: 'יעל', at: '2026-10-01T10:00:00Z', act: 'add', col: 'tasks', rid: 't1', title: 'x' });
    const { page } = await openTrip(browser, db);
    const r = await page.evaluate(async (key) => {
      const fs = (window as any).firebase.firestore(), trip = fs.collection('trips').doc(key);
      const tryIt = (p: Promise<unknown>) => p.then(() => 'allowed', (e: any) => e.code);
      const withTrash = fs.batch();
      withTrash.set(trip.collection('trash').doc('tasks__t1'), { col: 'tasks', rid: 't1', data: {}, at: 'x' });
      withTrash.delete(trip.collection('tasks').doc('t1'));
      return {
        bareDelete: await tryIt(trip.collection('participants').doc('p1').delete()),
        deleteLog: await tryIt(trip.collection('activity').doc('a1').delete()),
        editLog: await tryIt(trip.collection('activity').doc('a1').set({ by: 'x' })),
        shortKey: await tryIt(fs.collection('trips').doc('short').collection('tasks').doc('a').set({ title: 'x' })),
        deleteWithTrash: await tryIt(withTrash.commit()),
        deleteTrash: await tryIt(trip.collection('trash').doc('tasks__t1').delete()),
      };
    }, KEY);
    expect(r).toEqual({ bareDelete: 'permission-denied', deleteLog: 'permission-denied', editLog: 'permission-denied', shortKey: 'permission-denied', deleteWithTrash: 'allowed', deleteTrash: 'permission-denied' });
    if ('failures' in db) db.failures.length = 0;
  });

  test('B01-H1 Excel export: one sheet per list, totals as formulas that match the app', async ({ browser, db }, info) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await settings(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא לאקסל' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^budapest-trip_\d{4}-\d\d-\d\d_\d{4}\.xlsx$/);
    const file = info.outputPath('trip.xlsx');
    await dl.saveAs(file);
    const wb = XLSX.read(readFileSync(file));
    expect(wb.SheetNames).toEqual(['סיכום', 'משתתפים', 'הוצאות', 'תרומות', 'קופות', 'משימות']);
    const sum = wb.Sheets['סיכום'];
    expect(sum.B3.f).toBe("SUM('משתתפים'!E:E)");
    expect([sum.B3.v, sum.C3.v]).toEqual([2250, 2250]);
    expect([sum.B8.v, sum.B9.v]).toEqual([2500, 250]);
    const ppl = XLSX.utils.sheet_to_json<any>(wb.Sheets['משתתפים']);
    expect(ppl.find(p => p['שם'] === 'בני לוי')).toMatchObject({ 'שולם בפועל (₪)': 500, 'נשאר לשלם (₪)': 1250 });
    expect(wb.Sheets['הוצאות'].E2.f).toBe('MAX(0,C2-D2)');
    expect(errors).toEqual([]);
  });

  test('B02-H1 a full backup file restores records that were lost', async ({ browser, db }, info) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await settings(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'גיבוי מלא (קובץ)' }).click()]);
    const file = info.outputPath('backup.json');
    await dl.saveAs(file);
    const backup = JSON.parse(readFileSync(file, 'utf8'));
    expect(backup.app).toBe('budapest-trip');
    await expect.poll(async () => (await db.get(`${T}/settings/backup`))?.kind).toBe('json');
    expect(Object.keys(backup.data.participants)).toHaveLength(4);
    // meanwhile another Claude update was applied; restoring must not forget that, or it would run again
    await db.put(`${T}/settings/claude`, { applied: ['b1', 'b2'] });
    // a bad batch wipes two participants and changes a third
    await db.remove(`${T}/participants/p1`);
    await db.remove(`${T}/participants/p2`);
    await db.put(`${T}/participants/p3`, { name: 'גלעד מור', amount: 0, status: 'לא שולם' });
    await page.locator('#rsFile').setInputFiles(file);
    await expect(sheet(page)).toContainText('רשומות');
    await sheet(page).getByRole('button', { name: /^לשחזר/ }).click();
    await expect.poll(async () => (await db.get(`${T}/participants/p2`))?.paidAmt).toBe(500);
    expect((await db.get(`${T}/participants/p1`))!.name).toBe('אבי כהן');
    expect((await db.get(`${T}/participants/p3`))!.amount).toBe(1750);
    expect((await db.get(`${T}/settings/claude`))!.applied).toEqual(['b1', 'b2']);
    expect(errors).toEqual([]);
  });

  test('B03-H1 the home screen asks for a backup when there is none from the last week', async ({ browser, db }) => {
    await seed(db);
    const { page } = await openTrip(browser, db);
    await expect(page.getByRole('button', { name: /עוד לא נשמר גיבוי/ })).toBeVisible();
    await db.put(`${T}/settings/backup`, { at: new Date().toISOString(), by: 'שלומי' });
    await expect(page.getByRole('button', { name: /גיבוי/ })).toHaveCount(0);
  });

  test('S01-N1 a link that is not a web address never becomes clickable', async ({ browser, db }) => {
    await seed(db);
    await db.put(`${T}/files/x1`, { name: 'קובץ חשוד', category: 'אחר', url: 'javascript:alert(document.cookie)', order: 1 });
    await db.put(`${T}/files/x2`, { name: 'העלון', category: 'עלון', url: 'drive.google.com/file/d/abc', order: 2 });
    const { page, errors } = await openTrip(browser, db);
    await sub(page, 'files');
    await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);
    await expect(page.locator('.row', { hasText: 'קובץ חשוד' })).toContainText('חסר קישור');
    await expect(page.locator('.row', { hasText: 'העלון' }).getByRole('link', { name: 'פתיחה' })).toHaveAttribute('href', 'https://drive.google.com/file/d/abc');
    expect(errors).toEqual([]);
  });

  test('O01-E1 with no signal the app says so, keeps working, and sends the change when the signal is back', async ({ browser, db }) => {
    await seed(db);
    const { page, errors } = await openTrip(browser, db);
    await page.context().setOffline(true);
    await expect(page.getByText('אין קליטה. רואים את המידע האחרון')).toBeVisible();
    await nav(page, 'משימות');
    await page.getByRole('button', { name: 'הכל' }).or(page.getByRole('button', { name: /^לעשות/ })).first().click();
    await page.getByRole('button', { name: 'סמן כבוצע' }).first().click();
    await expect(page.getByText('בוצע. כל הכבוד')).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByText('אין קליטה')).toHaveCount(0);
    await expect.poll(async () => (await db.get(`${T}/tasks/t1`))?.status).toBe('בוצע');
    expect(errors).toEqual([]);
  });
});
