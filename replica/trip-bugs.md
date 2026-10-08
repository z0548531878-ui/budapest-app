# Bugs: שבת גיבוש בודפשט (`/trip`)

Severity: S1 data loss / security / money wrong · S2 feature broken, no workaround · S3 broken with a workaround or visibly wrong · S4 cosmetic.
Each one was reproduced by running its test against the app as it was before the fix (`git show 65ae453:trip/index.html`). The fix commit is the one that adds this file.

### TRIP-001: a partial payment isn't counted anywhere

- Severity: S1 (money wrong)
- Flow / case: M01-H1, M03-H1

Steps
1. A participant (1,750 ₪) pays 500 ₪. The organizer marks him "שולם חלקית" (the only option; there was nowhere to write the amount).
2. Open כסף.

Expected: "כבר בקופה" includes the 500 ₪, and the cash box of whoever got it does too.
Actual: "כבר בקופה" showed 2,750 ₪ instead of 3,250 ₪. Only "שולם" counted, so every partial payment disappeared from the totals and from the cash boxes. The cash count at the end of the trip would come out short by the sum of all partial payments.
Evidence: M01-H1 on the old version: `כבר בקופה2,750 ₪`.
Fix: participants have a "כמה שולם עד עכשיו" field; choosing "שילם חלק" asks for the amount, and a partial payment that reaches the full amount becomes "שולם". Totals, cash boxes, the Excel export and the reminders all use what was actually paid.
Status: fixed

### TRIP-002: the payment reminder asks someone who paid part for the full amount

- Severity: S2
- Flow / case: M04-H1
- Steps: a participant paid 500 of 1,750 ₪; open כסף ← תזכורת בוואטסאפ.
- Expected: his message asks for 1,250 ₪, the total owed is 3,000 ₪. Actual: 1,750 ₪ each, total 3,500 ₪.
- Evidence: M04-H1 on the old version: `2 לא שילמו · 3,500 ₪`.
- Fix: the reminders (single and bulk) use what is still owed.
- Status: fixed

### TRIP-003: anything deleted is gone for good, and anyone holding the link can delete everything

- Severity: S1 (data loss)
- Flow / case: D01-H1, D01-N1
- Steps: delete a record (or have a Claude update batch carry a wrong delete).
- Expected: a way back. Actual: no backup, no trash, and the rules let any write through, including deleting every participant from the browser console in one loop.
- Evidence: the rules allowed `read, write` on every trip collection with no conditions; there was no export or backup anywhere in the app.
- Fix: every delete keeps a copy in `trash` ("נמחקו לאחרונה" in settings, restore with one tap); the rules refuse a delete that has no copy in trash, and refuse deleting trash or the activity log, or editing the log. (Field types aren't checked by the rules: a record already saved with an odd value would then refuse every later edit.) Full backup to a file and restore from it, and an Excel export. Home asks for a backup when there's none from the last week.
- Status: fixed (the rules take effect once they're published in the Firebase console; see `docs/trip-runbook.md`)

### TRIP-004: a document link can run code

- Severity: S2 (security)
- Flow / case: S01-N1
- Steps: a document whose link is `javascript:…` (typed by mistake, pasted, or written by an update batch); tap "פתיחה".
- Expected: not clickable. Actual: the link ran the code on the phone of whoever tapped it.
- Evidence: S01-N1 on the old version found 1 `a[href^="javascript"]`.
- Fix: only http(s), tel and mailto links become clickable; a bare `drive.google.com/…` gets `https://`.
- Status: fixed

### TRIP-005: rows with their own buttons were buttons inside buttons

- Severity: S3 (accessibility)
- Flow / case: A11Y-1
- Steps: open כסף with a screen reader.
- Expected: each control announced once. Actual: axe `nested-interactive`: the participant row (a button) holds the payment button, and the task row holds the ✓ button; screen readers announce them wrongly and some can't reach the inner button.
- Fix: in such rows the name area becomes the button, side by side with the others. Enter and Space open it.
- Status: fixed

### TRIP-006: sheets don't take the keyboard focus

- Severity: S3 (accessibility)
- Flow / case: A11Y-2
- Steps: with a keyboard (or a screen reader), open a task.
- Expected: focus moves into the sheet and comes back to the row when it closes. Actual: focus stayed behind the sheet, Tab walked through the page underneath.
- Fix: the sheet takes focus, Tab stays inside it, Escape closes it and focus returns to the same row (even if the screen was redrawn meanwhile).
- Status: fixed

## To check (not reproduced in a test)

- **Activity log over 1,000 entries.** The app read `activity` with `limit(1000)` and no order; Firestore then returns the first 1,000 by document id, which are random, so once the log passed 1,000 the newest actions could be missing from "מה חדש" and from the report to Claude. The in-memory stand-in returns documents in insertion order, so it can't show this. Changed anyway: the newest 600 by time.
- **No signal in Budapest.** Without Firestore's offline cache and without a service worker, reopening the app with no signal showed no data (or no page at all). Both are added now. O01-E1 covers the banner and a queued change; opening from the home screen in airplane mode needs a real phone (https only), see the manual list in `trip-test-plan.md`.
