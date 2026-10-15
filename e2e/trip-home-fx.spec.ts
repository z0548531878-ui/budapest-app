// Home screen animations driven by the clock: sky by Budapest time, the plane during the flight, the Shabbat card.
import { test, expect, openTrip } from './helpers';
import { seedBigTrip } from './trip-seed';

const open = async (browser: any, db: any, at: string, role = 'guest:p2') => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.clock.setFixedTime(new Date(at));
  await page.evaluate((r: string) => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', r); }, role);
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  if (role === 'org') await page.evaluate("setRole('org')");
  await page.evaluate('render(true)');
  return page;
};

test('the header sky follows Budapest time', async ({ browser, db }) => {
  const page = await open(browser, db, '2026-10-14T22:30:00+02:00');
  await expect.poll(() => page.evaluate(() => document.body.dataset.sky)).toBe('night');
  await expect(page.locator('header.top .skyfx')).toHaveCount(1);
});

test('during the flight the plane sits on the route and says when it lands', async ({ browser, db }) => {
  const page = await open(browser, db, '2026-11-19T10:00:00+02:00');
  await expect(page.locator('.pass.air').first()).toBeVisible();
  await expect(page.locator('.air-lb').first()).toContainText('נחיתה בעוד 2 שע׳ ו־15 דק׳');
});

test('on Friday the Shabbat card counts down to candle lighting, then says Shabbat shalom', async ({ browser, db }) => {
  let page = await open(browser, db, '2026-11-20T13:10:00+01:00');
  await expect(page.locator('.shabc')).toContainText('הדלקת נרות בבודפשט');
  await expect(page.locator('.nowc .nc-bar')).toHaveCount(1);
  await page.context().close();
  page = await open(browser, db, '2026-11-21T10:05:00+01:00', 'org');
  await expect(page.locator('.shabc')).toContainText('שבת שלום');
});

test('home says when the data was last updated, and warns when it is old', async ({ browser, db }) => {
  const page = await open(browser, db, '2026-10-15T12:00:00+03:00');
  await page.evaluate(() => { (0, eval)('LASTSYNC=Date.now()-3*6e4;syncPaint()'); });
  await expect(page.locator('.syncago')).toHaveText('המידע עודכן לפני 3 דק׳');
  await page.evaluate(() => { (0, eval)('LASTSYNC=Date.now()-40*6e4;syncPaint()'); });
  await expect(page.locator('.syncago.stale')).toContainText('לפני 40 דק׳');
});
