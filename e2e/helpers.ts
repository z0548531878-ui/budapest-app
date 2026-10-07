import { test as base, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FakeFirestore } from './fake-firestore';

export { expect };

export type Player = { page: Page; errors: string[]; dialogs: string[] };

/** Opens the app in a fresh browser context (its own localStorage, like a separate phone). */
export async function openPlayer(browser: Browser, db: FakeFirestore, opts: { answers?: string[]; path?: string } = {}): Promise<Player> {
  const context = await browser.newContext();
  await db.attach(context);
  const page = await context.newPage();
  const errors: string[] = [], dialogs: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const answers = [...(opts.answers || [])];
  page.on('dialog', d => { dialogs.push(d.message()); d.type() === 'prompt' ? d.accept(answers.shift() ?? '') : d.accept(); });
  await page.goto(opts.path || '/index.html');
  return { page, errors, dialogs };
}

export const test = base.extend<{ db: FakeFirestore }>({
  db: async ({}, use) => {
    const db = new FakeFirestore();
    await use(db);
  },
});

export async function enterName(page: Page, name: string) {
  const input = page.locator('.screen.active').getByLabel('כתבו כאן שם ושם משפחה');
  await input.fill(name);
  await input.press('Enter');
}

/** axe scan of the current screen; returns the serious/critical violations so specs can assert on them. */
export async function a11y(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.help} (${v.nodes.length})`);
}
