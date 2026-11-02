// The November feature pack: help and emergency, pickup point, organizer tools, scheduled announcements, error reports.
import { test, expect, openTrip, TRIP as T } from './helpers';
import { seedBigTrip } from './trip-seed';

const as = async (browser: any, db: any, role: string) => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.evaluate((r: string) => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', r); }, role);
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  if (role === 'org') await page.evaluate("setRole('org')");
  return page;
};

test('a participant reaches help and emergency from home, with 112 and the hotel', async ({ browser, db }) => {
  const page = await as(browser, db, 'guest:p2');
  await page.locator('#fxSos').click();
  const d = page.getByRole('dialog');
  await expect(d).toContainText('112');
  await expect(d).toContainText('ניווט למלון');
  await expect(d.getByRole('button', { name: /הלכתי לאיבוד/ })).toBeVisible();
});

test('an organizer publishes a pickup point and participants see it with navigation', async ({ browser, db }) => {
  await seedBigTrip(db);
  await db.put(`${T}/settings/pickup`, { kind: 'pickup', text: 'היציאה הראשית של המלון', lat: 47.5, lng: 19.05, at: Date.now(), hidden: false });
  const page = await as(browser, db, 'guest:p2');
  await expect(page.locator('.pickc')).toContainText('היציאה הראשית של המלון');
  await expect(page.locator('.pickc a')).toHaveAttribute('href', /47\.5,19\.05/);
});

test('the organizers get tools on home and one search across everything, without a morning summary', async ({ browser, db }) => {
  const page = await as(browser, db, 'org');
  await expect(page.locator('.ftools')).toBeVisible();
  await expect(page.getByText('סיכום הבוקר')).toHaveCount(0);
  await page.locator('#fxSearch').click();
  await page.locator('#gsQ').fill('משימה');
  await expect(page.locator('.gsi').first()).toBeVisible();
});

test('an announcement set for later is held back, then published when its time comes', async ({ browser, db }) => {
  const page = await as(browser, db, 'org');
  const at = Date.now() - 1000;
  await page.evaluate(a => (0, eval)('db').doc('settings/annq_' + a).set({ kind: 'annq', title: 'תזכורת', text: 'יוצאים בשמונה', at: a }), at);
  await page.evaluate('annQueue()');
  await expect.poll(() => page.evaluate(a => (0, eval)('S').settings.some((x: any) => x._id === 'ann_' + a && x.kind === 'ann'), at)).toBe(true);
});

test('an error on a phone is reported to the organizers', async ({ browser, db }) => {
  const page = await as(browser, db, 'org');
  await page.evaluate("errReport('בדיקה: משהו נשבר','test')");
  await expect.poll(() => page.evaluate("S.settings.some(x => x.kind === 'err' && x.msg.includes('בדיקה'))")).toBe(true);
});

test('after the last evening, home offers the trip album to open, share and save', async ({ browser, db }) => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.clock.setFixedTime(new Date('2026-11-21T19:00:00+01:00'));
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p2'); });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  await page.evaluate(async () => { const ev = (0, eval); for (let i = 0; i < 3; i++) await ev('db').doc('photos/al' + i).set({ th: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', by: 'p5', byName: 'משה', ts: Date.now() - i * 864e5 }); });
  await expect(page.locator('.album')).toContainText('3 תמונות');
  await page.locator('#fxAlbOpen').click();
  await expect.poll(() => page.evaluate('GTAB')).toBe('gi');
});

test('on Friday morning the Shabbat card already counts down to candle lighting', async ({ browser, db }) => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.clock.setFixedTime(new Date('2026-11-20T07:30:00+01:00'));
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p2'); });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  await page.evaluate('render(true)');
  await expect(page.locator('.shabc')).toContainText('הדלקת נרות');
});

test('a quiet thank-you: sent without a name, counted at once, opened after havdalah', async ({ browser, db }) => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.clock.setFixedTime(new Date('2026-11-21T18:00:00+01:00'));
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p5'); });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  await page.locator('#fxThx').click();
  await page.locator('[data-th="p2"]').click();
  await page.locator('#thT').fill('על העזרה עם המזוודות');
  await page.locator('#thOk').click();
  await expect.poll(() => page.evaluate("S.settings.some(x => x.kind === 'thx' && x.to === 'p2' && !x.by)")).toBe(true);
  await page.evaluate("setRole('guest:p2')");
  await page.locator('#fxThxOpen').click();
  await expect(page.getByRole('dialog')).toContainText('על העזרה עם המזוודות');
});

test('the photos screen offers "find me in the photos" to participants', async ({ browser, db }) => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p2'); });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  await page.evaluate("GTAB='gi';render(true)");
  await page.locator('#fxFace').click();
  await expect(page.getByRole('dialog')).toContainText('הזיהוי נעשה רק בטלפון הזה');
});

const at = async (browser: any, db: any, when: string, extra?: (db: any) => Promise<void>) => {
  await seedBigTrip(db);
  if (extra) await extra(db);
  const { page } = await openTrip(browser, db);
  await page.clock.setFixedTime(new Date(when));
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p2'); });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  await page.evaluate('render(true)');
  return page;
};

test('my way home: the return group, when to leave for the airport, and the flight', async ({ browser, db }) => {
  const page = await at(browser, db, '2026-11-21T15:30:00+01:00', async d => { await d.put(`${T}/participants/p2`, { returnGroup: 'מוצ״ש' }); });
  await expect(page.locator('.retc')).toContainText('קבוצה א׳');
  await expect(page.locator('.retc')).toContainText('יציאה לשדה 17:20');
  await expect(page.locator('.ret-cd')).toBeVisible();
});

test('Saturday night: whoever stays sees kosher places nearby and can join a shared table', async ({ browser, db }) => {
  const page = await at(browser, db, '2026-11-21T18:30:00+01:00', async d => { await d.put(`${T}/participants/p2`, { returnGroup: 'ראשון ערב' }); });
  await page.locator('#fxMotzJoin').click();
  await expect.poll(() => page.evaluate("!!(S.settings.find(x => x._id === 'motzash') || {}).join?.p2")).toBe(true);
  await page.locator('#fxMotzList').click();
  await expect(page.getByRole('dialog')).toContainText('אשיז');
});

test('on the way to Kerestur a welcome to the tomb opens, offline', async ({ browser, db }) => {
  const page = await at(browser, db, '2026-11-19T14:10:00+01:00');
  await page.locator('#fxKer').click();
  await expect(page.getByRole('dialog')).toContainText('רבי ישעיה מקרעסטיר');
});

test('scrolling down shows a slim bar with the trip name and what is next', async ({ browser, db }) => {
  const page = await at(browser, db, '2026-11-20T11:20:00+01:00');
  await expect(page.locator('#slimBar')).not.toHaveClass(/on/);
  await page.evaluate(() => scrollTo(0, 900));
  await expect(page.locator('#slimBar')).toHaveClass(/on/);
  await expect(page.locator('#slimBar')).toContainText('הבא');
});
