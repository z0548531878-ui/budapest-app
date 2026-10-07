import { test, expect, openPlayer } from './helpers';

// What a visitor could try from the browser console. Only meaningful against the emulator with firestore.rules.
test.describe('firestore.rules', () => {
  test.skip(!process.env.FIRESTORE_EMULATOR_HOST, 'needs the Firestore emulator: npm run test:rules');

  test('SEC-1 console attacks on the leaderboards and rooms are refused', async ({ browser, db }) => {
    await db.put('solo_players_s5/רבקה גולד', { name: 'רבקה גולד', best: 700, games: 4 });
    await db.put('rooms/ABC123', { phase: 'lobby', qIndex: -1 });
    const { page } = await openPlayer(browser, db);
    const results = await page.evaluate(async () => {
      const fs = (window as any).firebase.firestore();
      const row = fs.collection('solo_players_s5').doc('רבקה גולד');
      const tryIt = (p: Promise<unknown>) => p.then(() => 'allowed', (e: any) => e.code);
      return {
        deleteRow: await tryIt(row.delete()),
        lowerBest: await tryIt(row.update({ best: 0 })),
        impossibleScore: await tryIt(fs.collection('solo_players_s5').doc('x y').set({ name: 'x y', best: 99999, games: 1 })),
        hugeName: await tryIt(fs.collection('solo_players_s5').doc('z').set({ name: 'z'.repeat(500), best: 1, games: 1 })),
        otherCollection: await tryIt(fs.collection('anything').doc('a').set({ x: 1 })),
        deleteRoom: await tryIt(fs.collection('rooms').doc('ABC123').delete()),
        duelScore: await tryIt(fs.collection('rooms').doc('DXYZ').set({ kind: 'duel', s1: 50000 })),
        // the game's own moves still work
        improveBest: await tryIt(row.update({ best: 800, games: 5 })),
        newPlayer: await tryIt(fs.collection('solo_players_s5').doc('נועה ברק').set({ name: 'נועה ברק', best: 0, games: 0, createdAt: Date.now() })),
      };
    });
    expect(results).toEqual({
      deleteRow: 'permission-denied', lowerBest: 'permission-denied', impossibleScore: 'permission-denied',
      hugeName: 'permission-denied', otherCollection: 'permission-denied', deleteRoom: 'permission-denied',
      duelScore: 'permission-denied', improveBest: 'allowed', newPlayer: 'allowed',
    });
    // the SDK logs each refusal; those were on purpose here
    db.failures.length = 0;
  });
});
