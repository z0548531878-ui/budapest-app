# Test plan: שבת גיבוש בודפשט (אפליקציית ניהול המסע, `/trip`)

Date: 2026-10-08  Env: local (`node e2e/serve.mjs`), in-memory Firestore stand-in (`e2e/fake-firestore.ts`), Chromium, Pixel 7 viewport.
The tests never touch the live Firebase project or the real trip data: each test seeds its own small trip under a test key.
`npm test` runs `e2e/trip.spec.ts` on the stand-in. `npm run test:rules` runs the same spec on the Firestore emulator with the real SDK and `firestore.rules`, including the rules case D01-N1.

Flows (derived from the code, there is no recon map): M money (participants, expenses, donations, cash boxes), D delete and restore,
B backup and export, S links and content safety, O offline. Tasks, schedule, Claude bridge and the WhatsApp senders are covered by the manual list below.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| M01-H1 | money | happy | open כסף with paid, part-paid, unpaid and exempt participants, 2 expenses, 2 donations | balance +2,500 ₪ (the exempt count as income, covered from the fund); "כבר בקופה" counts the part payment (3,250 ₪); the part-paid row shows 500 / 1,750 | e2e | pass |
| M02-H1 | money | happy: cash boxes | open קופות, then count Shlomi's box at 1,400 | each holder's in/out/balance; Yael's expense listed as owed to her; gap −100 ₪ shown and saved | e2e | pass |
| M03-H1 | money | happy: partial payment | רישום תשלום → שילם חלק → 800 → then the rest | asks for the amount; 800 saved, cash counts it; full payment sets 1,750 and "שולם" | e2e | pass |
| M04-H1 | money | edge: reminder after a part payment | open תזכורת בוואטסאפ | asks only for what is still owed (1,250 ₪), total owed 3,000 ₪ | e2e | pass |
| D01-H1 | delete | happy | delete an expense (two taps), then restore it from הגדרות | record gone, copy in trash, back with one tap, list empty again | e2e | pass |
| D01-N1 | delete | negative: rules | from the console: bare delete, delete the log, edit the log, short key, delete with a trash copy, delete trash | everything refused except the delete with a trash copy | e2e (emulator) | pass |
| B01-H1 | backup | happy: Excel | ייצוא לאקסל | file named budapest-trip_<date>.xlsx; sheets סיכום, משתתפים, הוצאות, תרומות, קופות, משימות; totals are formulas that equal the app's numbers (also checked with LibreOffice: 12 formulas, 0 errors) | e2e | pass |
| B02-H1 | backup | happy: full backup and restore | download the backup, another Claude update is applied, lose two participants and change a third, restore from the file | all three back as they were in the backup; the list of applied Claude updates is not rolled back | e2e | pass |
| B03-H1 | backup | edge: no recent backup | open home with no backup, then with one from today | home asks for a backup, then stops asking | e2e | pass |
| S01-N1 | files | negative: script link | a file whose link is `javascript:…`, and one without https:// | the first isn't clickable ("חסר קישור"); the second opens https://… | e2e | pass |
| O01-E1 | offline | edge: no signal | go offline, mark a task done, come back online | banner says there's no signal; the task is marked at once; the change reaches the database when back online | e2e | pass |
| A11Y-1 | all | screen reader | axe (WCAG 2.1 AA) on every screen, every money tab and 8 sheets | no serious or critical violations | e2e | pass |
| A11Y-2 | all | keyboard | open a task with Enter, close with Escape | focus moves into the sheet and back to the same row | e2e | pass |
| A11Y-3 | all | touch targets | measure every button and link on 6 screens | none smaller than 24×24 (WCAG 2.5.8) | e2e | pass |

## Manual pass (needs a real phone)

- Install the app to the home screen, open it once with signal, turn on airplane mode and open it again: it should open with all the data and the offline banner. (The service worker only runs on https, so the tests can't cover this.)
- Excel file opens in Excel and in Google Sheets on a phone, right to left, with ₪ formatting. Formulas recalculate when a number is changed.
- "שחזור מגיבוי" from a backup saved in Google Drive on an iPhone (the file picker).
- Dictation, the WhatsApp senders and the Claude bridge, unchanged by this round.
