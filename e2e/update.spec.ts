// An app that is already open picks up a new version on the home screen (never mid-game).
import { test, expect, openPlayer } from './helpers';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('F14-E1 APP_BUILD matches version.json', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const v = JSON.parse(readFileSync(join(__dirname, '..', 'version.json'), 'utf8')).v;
  expect(html.match(/const APP_BUILD = '([^']+)'/)![1]).toBe(v);
});

test('F14-H1 a newer version reloads the home screen once', async ({ browser, db }) => {
  const { page } = await openPlayer(browser, db, { setup: async c => {
    await c.addInitScript(() => { (window as any).__testUpdate = 1; });
    await c.route(/version\.json/, r => r.fulfill({ contentType: 'application/json', body: '{"v":"9999-new"}' }));
  } });
  await expect(page.getByRole('button', { name: /משחק עצמאי/ })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => page.url(), { timeout: 15000 }).toContain('v=9999-new');
  await expect(page.getByRole('button', { name: /משחק עצמאי/ })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(page.url()).toContain('v=9999-new'); // no reload loop
});

test('F14-H2 the installed app loads the game at the current version', async ({ browser, db }) => {
  const v = JSON.parse(readFileSync(join(__dirname, '..', 'version.json'), 'utf8')).v;
  const { page } = await openPlayer(browser, db, { path: '/play/index.html' });
  await expect.poll(() => page.locator('#game').getAttribute('src')).toContain('v=' + v);
  await expect(page.frameLocator('#game').getByRole('button', { name: /משחק עצמאי/ })).toBeVisible();
});
