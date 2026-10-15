// The participant's entry gate on a phone: in-app browser, old iPhone, add to home screen, notifications.
// SHOTS=1 also saves a picture of each screen to SHOTS_OUT (default /tmp/shots).
import { test, expect, openTrip, TRIP_KEY } from './helpers';
import { seedBigTrip } from './trip-seed';

const OUT = process.env.SHOTS_OUT || '/tmp/shots';
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1',
  iphoneInsta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  androidWa: 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36 WhatsApp/2.25',
};
const cases: { name: string; ua: string; standalone?: boolean; perm?: string; title: RegExp }[] = [
  { name: 'iphone-inapp', ua: UA.iphoneInsta, title: /פותחים בדפדפן/ },
  { name: 'android-inapp', ua: UA.androidWa, title: /פותחים בדפדפן/ },
  { name: 'iphone-old', ua: UA.iphoneOld, title: /לעדכן את האייפון/ },
  { name: 'iphone-install', ua: UA.iphone, title: /מוסיפים למסך הבית/ },
  { name: 'android-install', ua: UA.android, title: /מוסיפים למסך הבית/ },
  { name: 'iphone-notify', ua: UA.iphone, standalone: true, perm: 'default', title: /הפעלת התראות/ },
  { name: 'android-denied', ua: UA.android, standalone: true, perm: 'denied', title: /ההתראות כבויות בטלפון/ },
];

for (const c of cases) {
  test(`entry gate: ${c.name}`, async ({ browser, db }) => {
    const { page } = await openTrip(browser, db);
    await page.addInitScript(([ua, st, perm]) => {
      localStorage.removeItem('role'); localStorage.removeItem('me'); localStorage.removeItem('nogate'); sessionStorage.removeItem('skipInst');
      Object.defineProperty(navigator, 'userAgent', { get: () => ua });
      // inside the installed app the participant has already written their name
      if (st) localStorage.setItem('role', 'guest:p2');
      if (st) { const mm = matchMedia.bind(window); window.matchMedia = q => q.includes('standalone') ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} } as any) : mm(q); }
      if (perm) Object.defineProperty(Notification, 'permission', { get: () => perm });
    }, [c.ua, !!c.standalone, c.perm || ''] as const);
    await page.reload();
    await expect(page.locator('#pgate h1')).toHaveText(c.title);
    if (c.name === 'android-inapp') {
      const href = await page.locator('#pchrome').getAttribute('href');
      expect(href).toContain(`?k=${TRIP_KEY}#Intent;scheme=https;package=com.android.chrome;end`);
    }
    if (process.env.SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/gate-${c.name}.png` }); }
  });
}

test('the Android Chrome link carries the key in ?k=', async ({ browser, db }) => {
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => localStorage.removeItem('tripKey'));
  await page.goto(`/trip/index.html?k=${TRIP_KEY}`);
  await expect.poll(() => page.evaluate('TRIP_KEY')).toBe(TRIP_KEY);
});

test('inside the installed app the name screen keeps the paste-the-link box closed', async ({ browser, db }) => {
  const { page } = await openTrip(browser, db);
  await page.addInitScript(() => {
    localStorage.removeItem('role'); localStorage.removeItem('me');
    const mm = matchMedia.bind(window); window.matchMedia = q => q.includes('standalone') ? ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} } as any) : mm(q);
  });
  await page.reload();
  await expect(page.locator('#gname')).toBeVisible();
  await expect(page.locator('#gkey')).toBeHidden();
});

test('a returning participant sees their name, and the birth date goes in three boxes', async ({ browser, db }) => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('lastG', JSON.stringify({ id: 'p2', name: 'גלעד מור' })); });
  await page.reload();
  await expect.poll(() => page.evaluate('loaded.has("participants") && S.participants.some(p => p._id === "p2")')).toBe(true);
  await page.evaluate(async () => { const ev = (0, eval); await ev('db').doc('participants/p2').set({ dobH: await ev('dobHash')('p2', '1985-03-15') }, { merge: true }); });
  await expect.poll(() => page.evaluate('!!S.participants.find(p => p._id === "p2").dobH')).toBe(true);
  await page.evaluate('logoutRole()');
  await expect(page.locator('#gate h1')).toHaveText('ברוך שובך');
  await expect(page.locator('#gate .gwho')).toContainText('גלעד מור');
  await expect(page.locator('#gate .gcd')).toBeVisible();
  await page.locator('#ggo').click();
  await expect(page.locator('#gdd')).toBeFocused();
  await page.keyboard.type('15'); await page.keyboard.type('03'); await page.keyboard.type('1985');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate('ROLE')).toBe('guest:p2');
  // five tabs, home on the right edge, the + in the middle
  await expect(page.locator('#nav button')).toHaveCount(5);
  await expect(page.locator('#nav button').first()).toHaveAttribute('data-gnav', 'gh');
  await expect(page.locator('#nav button').nth(2)).toHaveAttribute('data-gnav', 'gadd');
  await expect(page.locator('#setBtn')).toBeVisible();
});

test('"not me" clears the remembered name and shows the empty name field', async ({ browser, db }) => {
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); localStorage.setItem('lastG', JSON.stringify({ id: 'p2', name: 'גלעד מור' })); });
  await page.reload();
  await page.evaluate('logoutRole()');
  await page.locator('#gnotme').click();
  await expect(page.locator('#gname')).toBeVisible();
  await expect(page.locator('#gname')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('lastG'))).toBeNull();
});

test('only Chaim Bloch gets a read-only expenses tile in his participant app', async ({ browser, db }) => {
  await seedBigTrip(db);
  await db.put('trips/test-trip-key-0123456789abcdef/participants/pcb', { name: 'חיים בלוך', status: 'שולם', amount: 0, order: 99 });
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p2'); });
  await page.reload();
  await expect.poll(() => page.evaluate('COLS.every(c => loaded.has(c))')).toBe(true);
  // another participant has no such tile
  await expect(page.locator('.gc[data-gnav="gv"]')).toHaveCount(0);
  await page.evaluate("setRole('guest:pcb')");
  await page.locator('.gc[data-gnav="gv"]').click();
  await expect(page.locator('.page-title h2')).toHaveText('הוצאות והכנסות');
  await page.locator('.seg [data-vseg="exp"]').click();
  const n = await page.evaluate('S.expenses.length');
  await expect(page.locator('[data-vexp]')).toHaveCount(n as number);
  await page.locator('[data-vexp]').first().click();
  const sh = page.getByRole('dialog');
  await expect(sh).toContainText('צפייה בלבד');
  await expect(sh.locator('input, textarea, select, .sheet-acts')).toHaveCount(0);
  // still a participant: the organizers' tabs are not there
  await expect(page.locator('#nav [data-nav="money"]')).toHaveCount(0);
});

test('"switch user" in settings signs out and opens an empty name screen', async ({ browser, db }) => {
  await seedBigTrip(db);
  const { page } = await openTrip(browser, db);
  await page.evaluate(() => { localStorage.setItem('nogate', '1'); sessionStorage.setItem('skipInst', '1'); localStorage.setItem('role', 'guest:p2'); });
  await page.reload();
  await expect.poll(() => page.evaluate('loaded.has("participants")')).toBe(true);
  await page.locator('#setBtn').click();
  await page.getByRole('dialog').getByRole('button', { name: /החלפת משתמש/ }).click();
  await expect(page.locator('#gname')).toBeVisible();
  await expect(page.locator('#gname')).toHaveValue('');
  expect(await page.evaluate('ROLE')).toBe('');
  expect(await page.evaluate(() => localStorage.getItem('lastG'))).toBeNull();
});
