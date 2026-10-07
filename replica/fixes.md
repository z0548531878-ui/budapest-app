# What players of other trivia games complain about, and what it means for טריוויה על גלגלים

## Sample size, stated plainly

This environment's network policy blocked every review source the skill asks for: the App Store reviews feed, Google Play,
Trustpilot, Reddit, Hacker News and the review aggregators. The only thing that worked was a web search tool, which returns
short excerpts and summaries, not full reviews. So:

- **Full reviews read: 0.** `replica/reviews.csv` and `feedback.md` were not produced, because `reviews.py` needs verbatim,
  linked rows and I could not copy any.
- **Evidence below:** short excerpts the search tool returned, each with the page it came from. Every theme is **thin**
  (fewer than 3 confirmed reviews or one source type). Treat this as direction, not proof.
- To make it solid: open the App Store page of Kahoot! and Trivia Crack in a browser and copy 100+ reviews into
  `replica/reviews.csv` (columns `source,url,date,rating,text`), then run `python3 .claude/skills/replica-entrepreneur/reviews.py replica/reviews.csv --out replica/feedback.md`.

## 1. What they hate

| # | Complaint | Evidence | Status in our game |
| --- | --- | --- | --- |
| 1 | Wrong or badly written questions, and no way to flag them | Trivia Crack: "how are all these ridiculous questions getting through?" ([ComplaintsBoard](https://www.complaintsboard.com/trivia-crack-no-ads-b150091)); a review summary of Trivia Tower notes users "unable to flag factual errors" ([marlvel.ai](https://marlvel.ai/apps/trivia-tower-trivia-game/reviews)). Thin: 2 sources. | **Fixed now** — round review + 🚩 report button |
| 2 | The same questions over and over | App Store reviewer, other trivia app: people "would give up in the game after seeing the same questions 75 times"; Sporcle Party review: "questions are repetitive" (via search summary, [worldsapps](https://worldsapps.com/reviews-sporcle-party-social-trivia)). Thin. | Already solved: the game remembers seen questions per player (in the cloud) and doesn't repeat them |
| 3 | Ads after every answer | Trivia Crack: "Every answer is followed by a full-page ad before you can tap continue" ([WhistleOut](https://www.whistleout.com/CellPhones/Apps/trivia-crack-app-review)); ads even when leaving a screen ([Common Sense Media](https://www.commonsensemedia.org/app-reviews/trivia-crack-adventure)). | None in our game |
| 4 | Player caps and paywalls | Kahoot free tier: "Not ideal with only 10 participants allowed" (search excerpt of a review site); subscription complaints across Trustpilot and the App Store (summaries). | Free, up to 100 players |
| 5 | Hard to join a game | Kahoot Google Play summaries mention "difficulty in joining games" ([Kimola](https://kimola.com/reports/kahoot-feedback-analysis-insightful-user-reviews-report-google-play-tr-148991)). Summary only. | One button, no PIN or code |

## 2. What is missing (asked for by name)

| # | Request | Evidence |
| --- | --- | --- |
| 1 | More time to read the question; custom timers | Kahoot's own community board has several threads: [15 sec time limit](https://support.kahoot.com/hc/en-us/community/posts/360018594934-15-sec-time-limit-per-question), [Time Increments](https://support.kahoot.com/hc/en-us/community/posts/24065894690835-Time-Increments), [Allow more time limit options](https://support.kahoot.com/hc/en-us/community/posts/36700429553555-Allow-more-time-limit-options), [Extending the time to read the question](https://support.kahoot.com/hc/en-us/community/posts/42266794597523-Extending-the-time-to-read-the-question). One player playing with friends asked for more time to read because "there is no whiteboard" (search summary). 4 threads, 1 source. |

## 3. What is unsolved (positioning)

Groups on a trip, where people are together in one place, mixed ages, mostly not tech-savvy, playing on their own phones,
with questions about their own world (Torah, Jewish history, the trip itself). The big apps are built for classrooms or for
strangers online.

## Fix plan

| # | Change | Size | Evidence | Status |
| --- | --- | --- | --- | --- |
| 1 | Round review: every question with the right answer and yours, and a 🚩 "יש כאן טעות" button that saves to `rooms/reports` | S | hate #1 | **done** (`e2e/solo.spec.ts` F01-H1 covers it) |
| 2 | Reading time: show the question ~2 s before the answers and the clock, or give long questions more time | M | missing #1 | **not done** — it changes scoring and the feel of the game; your call |
| 3 | Host chooses the timer (8 / 11 / 15 s) in the group lobby | S | missing #1 | not done — your call |
| 4 | Say what's already true on the landing screen: "בלי פרסומות · בלי הרשמה · עד 100 משתתפים" | S | hate #3–#5 | not done — copy decision for you |

To read the reports: Firebase Console → Firestore → `rooms` → `reports` → `list`.

## The angle

> For groups on a trip who want a game everyone can join in one tap,
> טריוויה על גלגלים is free, ad-free, needs no sign-up or code, and never repeats a question.
> Evidence: hate #2–#5 (thin, see above).

Other options: "trivia in our world" (Torah, Jewish history, the trip's own polls), and "a host game for 100 people
without a projector". The first one is recommended: it's what the other apps get wrong and what this game already does.
