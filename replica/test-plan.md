# Test plan: טריוויה על גלגלים

Date: 2026-10-07  Env: local (`node e2e/serve.mjs`), in-memory Firestore stand-in (`e2e/fake-firestore.ts`), Chromium, Pixel 7 viewport.
The tests never touch the live Firebase project.
`npm test` runs on the in-memory stand-in. `npm run test:rules` runs the same specs on the Firestore emulator with the real SDK and `firestore.rules` (all 18 + SEC-1 pass).

Flows (derived from the code, there is no recon map): F01 solo game, F02 duel (ראש בראש), F03 group game (host + players).

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | solo | happy | register, play 30 questions, end screen | final score = sum of points, saved as best, row in leaderboard | e2e | pass |
| F01-E1 | solo | edge: single name | type one word | alert asks for first + last name, nothing saved | e2e | pass |
| F01-E2 | solo | edge: frantic tapping | tap all four answers twice at once | one answer counted, ≤ 32 pts | e2e | pass |
| F01-E3 | solo | edge: markup / quotes in names | leaderboard row with `<img onerror>`, name with quotes | shown as text, no script runs | e2e | pass |
| F01-E4 | solo | edge: timer runs out | don't answer | "נגמר הזמן", 0 pts, next question | e2e | pass |
| F01-E5 | solo | edge: quit mid-round | quit on Q1 | home screen, no game saved | e2e | pass |
| F01-E6 | solo | edge: refresh / come back | reload after registering | name shown on home, no re-registration | e2e | pass |
| F02-H1 | duel | happy | A invites B, B accepts, 30 questions | same questions for both, scores match the room, both saved to duel leaderboard | e2e | pass |
| F02-E1 | duel | edge: invite declined | B taps "לא עכשיו" | A is told, can invite again | e2e | pass |
| F02-E2 | duel | edge: leave lobby | B taps home | B disappears from A's list | e2e | pass |
| F02-E3 | duel | edge: two tabs invite each other at once | both tap "הזמנה" together | at most one open invite | e2e | pass |
| F02-E4 | duel | edge: opponent closes the app | B closes mid-duel | A told, duel ends, A wins | e2e | pass (after fix, BUG-002) |
| F03-H1 | group | happy | host PIN, 2 players join, 3 questions, end game | early reveal when all answered, scores on every screen agree | e2e | pass |
| F03-E1 | group | edge: player pruned from lobby, then answers | prune a player, start, they answer | game keeps going | e2e | pass (after fix, BUG-001) |
| F03-E2 | group | negative: wrong host PIN | enter 1111 | "קוד שגוי", no room opened | e2e | pass |
| F03-E3 | group | edge: same name twice | join twice with the same name (extra space) | listed once | e2e | pass |
| F03-E4 | group | edge: pause | pause 12s, resume | timer resumes where it stopped | e2e | pass |
| F03-E5 | group | security: quotes in a name | join as `אבי" onclick="…"`, host taps avatar | no attribute injected, nothing runs | e2e | pass (after fix, BUG-004) |
| SEC-1 | rules | security: console attacks | delete / lower / inflate leaderboard rows, other collections, delete room | all refused, normal play allowed | e2e (emulator) | pass |
| A11Y | all | axe scan | see `/design:accessibility-review` step | | e2e | see `replica/a11y.md` |

Manual (not automatable here): sound and vibration on real phones, iPhone wake lock, real network loss mid-game, push notification to the host.
