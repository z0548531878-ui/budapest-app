import AxeBuilder from '@axe-core/playwright';
import { test, expect, openPlayer, enterName, type Player } from './helpers';

// axe on every main screen; serious and critical findings fail the test
async function scan(p: Player, screen: string) {
  await p.page.waitForTimeout(1200); // let entrance animations settle (axe reads mid-fade colours otherwise)
  // meta-viewport: zoom is turned off on purpose (fast taps in a timed game kept zooming the page), see replica/a11y.md
  const r = await new AxeBuilder({ page: p.page }).disableRules(['meta-viewport']).analyze();
  return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${screen} · ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
}

test('A11Y-1 solo screens have no serious axe violations', async ({ browser, db }) => {
  const p = await openPlayer(browser, db);
  const found: string[] = [];
  found.push(...await scan(p, 'landing'));
  await p.page.getByRole('button', { name: /משחק עצמאי/ }).click();
  found.push(...await scan(p, 'register'));
  await enterName(p.page, 'משה כהן');
  await expect(p.page.getByText('שלום,')).toBeVisible();
  found.push(...await scan(p, 'solo home'));
  await p.page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
  await expect(p.page.getByText('שאלה 1 מתוך 30')).toBeVisible();
  found.push(...await scan(p, 'question'));
  await p.page.locator('#s-answers').getByRole('button').first().click();
  found.push(...await scan(p, 'reveal'));
  expect(found).toEqual([]);
});

test('A11Y-2 group and duel lobbies have no serious axe violations', async ({ browser, db }) => {
  const host = await openPlayer(browser, db, { answers: ['2026'] });
  await host.page.getByRole('button', { name: /כניסת מנחה משחק/ }).click();
  const p = await openPlayer(browser, db);
  await p.page.getByRole('button', { name: /משחק קבוצתי/ }).click();
  await enterName(p.page, 'אלי כהן');
  await expect(p.page.locator('.wait-title')).toBeVisible();
  const d = await openPlayer(browser, db);
  await d.page.getByRole('button', { name: /משחק ראש בראש/ }).click();
  await enterName(d.page, 'דני לוי');
  await expect(d.page.getByText('בחרו יריב')).toBeVisible();
  const found = [...await scan(host, 'host lobby'), ...await scan(p, 'player lobby'), ...await scan(d, 'duel lobby')];
  await d.page.locator('[data-rules]').first().dispatchEvent('click');
  found.push(...await scan(d, 'rules modal'));
  expect(found).toEqual([]);
});

test('A11Y-3 the rules dialog takes focus, closes with Escape, and answers are announced', async ({ browser, db }) => {
  const p = await openPlayer(browser, db);
  await p.page.getByRole('button', { name: /משחק עצמאי/ }).click();
  await p.page.locator('.screen.active [data-rules]').first().dispatchEvent('click');
  const dialog = p.page.getByRole('dialog', { name: /הוראות המשחק/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /הבנתי/ })).toBeFocused();
  await p.page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await enterName(p.page, 'משה כהן');
  await p.page.getByRole('button', { name: /התחילו סבב חדש/ }).click();
  await expect(p.page.getByText('שאלה 1 מתוך 30')).toBeVisible();
  await p.page.locator('#s-answers').getByRole('button').first().click();
  await expect(p.page.getByRole('status')).toHaveText(/נכון|מהירות שיא/);
});
