# Bugs

Severity: S1 data loss / security / core flow blocked · S2 feature broken, no workaround · S3 broken with a workaround or visibly wrong · S4 cosmetic.

### BUG-001: a group game freezes for good if a player who was dropped from the lobby answers

- Severity: S1
- Flow / case: F03 / F03-E1
- Screen: host question screen
- Browser / device: Chromium, Pixel 7

Steps
1. Host opens a room, two players join.
2. One player's phone sleeps in the lobby for 90 seconds; the host's screen prunes them (deletes their player document).
3. Host starts the game. The sleeping phone wakes up during question 1 and answers.

Expected: the answer is revealed and the game moves on.
Actual: the host's end-of-question batch includes an update to the deleted player document, so the whole batch fails with NOT_FOUND. The watchdog retries every 800 ms, fails every time, and the game stays on question 1 forever for everyone.
Evidence: `e2e/group.spec.ts` F03-E1 failed with 11 × `NOT_FOUND: update on missing document rooms/…/players/…`.
Fix: the host only scores answers from players listed in the room, and a player whose registration vanished re-registers when answering.
Status: fixed

### BUG-002: when the opponent leaves a duel, the other player is left alone for ~5 minutes

- Severity: S3
- Flow / case: F02 / F02-E4

Steps
1. A and B start a duel.
2. B closes the app on question 1.

Expected: A is told the opponent left and the duel ends.
Actual: no notice; A has to sit through 30 questions × 11 s timers alone.
Evidence: `e2e/duel.spec.ts` F02-E4 failed (no "עזב" text within 30 s).
Fix: both phones send a heartbeat to the duel document every 4 s; if the opponent's heartbeat stops for 20 s the duel ends, the remaining player wins and sees why.
Status: fixed

### BUG-003: "הרשמה והמשך" loses its icon after cancelling a name clash

- Severity: S4
- Flow / case: F01 / registration
- Steps: register with a name that already exists, press "ביטול" in the confirm.
- Expected: button reads "🎯 הרשמה והמשך". Actual: "הרשמה והמשך".
- Status: fixed

### BUG-004: a player name with a quote mark runs code on other players' phones

- Severity: S1 (security)
- Flow / case: F03 / F03-E5
- Steps: join the group lobby with the name `אבי" onclick="window.__pwned=1`; the host taps the avatar.
- Expected: the name is shown as text. Actual: `esc()` left quotes alone, the name closed the `title="…"` attribute and added an `onclick` that ran on the host's phone.
- Evidence: F03-E5 failed with `onclick = "window.__pwned=1"`.
- Fix: `esc()` escapes `"` and `'` too. Details in `replica/security.md`.
- Status: fixed

## To check (not reproduced)

- Duel and solo scores are computed on the phone and written straight to Firestore, so a technical user could write any score. See the security review (`replica/security.md`).
- Same name joined from two tabs: the newer tab deletes the older registration, but the older tab's 30-second heartbeat re-creates it, so the name can show twice again. Seen once under heavy test load; rare in real use (the same person in two tabs).
