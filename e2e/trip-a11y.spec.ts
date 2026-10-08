// Accessibility of every screen and sheet in the trip app: axe (WCAG 2.1 AA), touch targets, and keyboard use of sheets.
import { test, expect, a11y, openTrip, TRIP as T, type Db } from './helpers';
import type { Page } from '@playwright/test';

async function seed(db: Db) {
  const put = (p: string, d: object) => db.put(`${T}/${p}`, d);
  await put('settings/trip', { team: ['שלומי', 'איציק', 'יעל'] });
  await put('tasks/t1', { title: 'להזמין אוטובוס', owner: 'שלומי', status: 'לביצוע', priority: 'גבוהה', category: 'אוטובוס', due: '2026-10-01', notes: '', order: 1 });
  await put('tasks/t2', { title: 'לאסוף דרכונים', owner: 'יעל', status: 'ממתין', priority: 'רגילה', category: 'משתתפים', due: '', notes: '', order: 2 });
  await put('participants/p1', { name: 'אבי כהן', amount: 1750, phone: '0501234567', status: 'שולם', method: 'העברה לאיציק', holder: 'איציק', passport: true, order: 1 });
  await put('participants/p2', { name: 'בני לוי', amount: 1750, phone: '0502345678', status: 'שולם חלקית', paidAmt: 500, holder: 'שלומי', carry: 'מזוודה 2', order: 2 });
  await put('expenses/e1', { name: 'מלון', category: 'לינה', estimate: 5000, paid: 2000, status: 'מקדמה', paidBy: 'איציק', order: 1 });
  await put('donations/d1', { donor: 'משפחת רוזן', amount: 1000, status: 'התחייב', order: 1 });
  await put('schedule/s1', { day: 'יום שישי', time: '18:00', title: 'סעודת ליל שבת', place: 'מסעדת חנה', order: 1 });
  await put('flights/f1', { label: 'קבוצתי', dir: 'הלוך', group: 'קבוצתי', flightNo: 'LY 2369', date: '2026-11-19', dep: '08:40', arr: '11:15' });
  await put('packing/k1', { item: 'נרות', qty: 60, list: 'שבת', where: 'בארץ', done: false, order: 1 });
  await put('rooms/r1', { occupants: 'אבי כהן', roomNumber: '412', floor: '4', type: 'חדר לזוג', kitReady: false, order: 1 });
  await put('messages/m1', { title: 'דרכונים', date: '2026-10-20', text: 'שלום לכולם', sent: false });
  await put('files/x1', { name: 'העלון', category: 'עלון', url: 'https://drive.google.com/x', order: 1 });
  await put('contacts/c1', { name: 'מסעדת חנה', role: 'אוכל', phone: '+36 1 234 5678', order: 1 });
  await put('notes/n1', { text: 'לקנות עוד מים', by: 'יעל', at: '2026-10-07T10:00:00Z', status: 'חדש' });
  await put('claude/q1', { title: 'מי אחראי על הנרות?', kind: 'שאלה', status: 'פתוח', pick: true, order: 1 });
  await put('trash/tasks__old', { col: 'tasks', rid: 'old', data: { title: 'משימה שנמחקה' }, by: 'יעל', at: '2026-10-07T10:00:00Z' });
}

const axe = async (page: Page, where: string) => (await a11y(page, ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])).map(v => `${where}: ${v}`);

test('A11Y-1 every screen and sheet passes axe (WCAG 2.1 AA)', async ({ browser, db }) => {
  test.setTimeout(240_000);
  await seed(db);
  const { page } = await openTrip(browser, db);
  await expect(page.getByText('להזמין אוטובוס')).toBeVisible();
  const found: string[] = [];
  found.push(...await axe(page, 'home'));
  for (const tab of ['משימות', 'כסף', 'לו״ז', 'עוד']) {
    await page.locator('#nav').getByRole('button', { name: tab }).click();
    found.push(...await axe(page, tab));
  }
  await page.locator('#nav').getByRole('button', { name: 'כסף' }).click();
  for (const seg of ['הוצאות', 'תרומות', 'קופות']) {
    await page.getByRole('button', { name: new RegExp('^' + seg) }).click();
    found.push(...await axe(page, 'כסף/' + seg));
  }
  const subs = ['program', 'people', 'passports', 'claude', 'packing', 'rooms', 'flights', 'messages', 'files', 'contacts', 'notes', 'guide', 'settings', 'attendance'];
  for (const sub of subs) {
    await page.evaluate(s => { (window as any).go('more', { sub: s }); }, sub);
    found.push(...await axe(page, sub));
  }
  // sheets
  const sheets: [string, string][] = [['editor', "editor('participants','p2')"], ['pay', "paySheet('p2')"], ['person', "personSheet('p2')"],
    ['update', "updSheet('home')"], ['activity', 'actSheet()'], ['count', 'countSheet()'], ['reminder', 'reminder()'], ['who', 'pickMe()']];
  for (const [name, js] of sheets) {
    await page.evaluate(js);
    await expect(page.getByRole('dialog')).toBeVisible();
    found.push(...await axe(page, 'sheet ' + name));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(found).toEqual([]);
});

test('A11Y-2 sheets take the keyboard focus and give it back when closed', async ({ browser, db }) => {
  await seed(db);
  const { page } = await openTrip(browser, db);
  await page.locator('#nav').getByRole('button', { name: 'משימות' }).click();
  const row = page.getByRole('button', { name: /^להזמין אוטובוס/ });
  await row.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('A11Y-3 buttons are big enough to tap (at least 24×24, WCAG 2.5.8)', async ({ browser, db }) => {
  await seed(db);
  const { page } = await openTrip(browser, db);
  await expect(page.getByText('להזמין אוטובוס')).toBeVisible();
  const small: string[] = [];
  for (const [tab, sub] of [['home', null], ['tasks', null], ['money', null], ['more', 'people'], ['more', 'packing'], ['more', 'settings']] as const) {
    await page.evaluate(([t, s]) => { (window as any).go(t, s ? { sub: s } : {}); }, [tab, sub]);
    small.push(...await page.evaluate(where => [...document.querySelectorAll('button,a,[role=button],input,textarea')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]'); })
      .map(el => `${where}: <${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`), tab + (sub ? '/' + sub : '')));
  }
  expect(small).toEqual([]);
});
