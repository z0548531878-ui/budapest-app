import { test as base, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FakeFirestore } from './fake-firestore';
import { EmulatorDb } from './emulator-db';

export { expect };

export type Player = { page: Page; errors: string[]; dialogs: string[] };
/** The in-memory stand-in by default; the real emulator with firestore.rules when FIRESTORE_EMULATOR_HOST is set */
export type Db = FakeFirestore | EmulatorDb;

/** Opens the app in a fresh browser context (its own localStorage, like a separate phone). */
export async function openPlayer(browser: Browser, db: Db, opts: { answers?: string[]; path?: string } = {}): Promise<Player> {
  const context = await browser.newContext();
  await db.attach(context);
  const page = await context.newPage();
  const errors: string[] = [], dialogs: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  // a transaction that loses a race is retried by the SDK; the browser still logs its rejected request
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
  const answers = [...(opts.answers || [])];
  page.on('dialog', d => { dialogs.push(d.message()); d.type() === 'prompt' ? d.accept(answers.shift() ?? '') : d.accept(); });
  await page.goto(opts.path || '/index.html');
  return { page, errors, dialogs };
}

export const test = base.extend<{ db: Db }>({
  db: async ({}, use) => {
    const db = process.env.FIRESTORE_EMULATOR_HOST ? await new EmulatorDb().init() : new FakeFirestore();
    await use(db);
    if (db instanceof EmulatorDb) expect(db.failures, 'requests the security rules refused').toEqual([]);
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
