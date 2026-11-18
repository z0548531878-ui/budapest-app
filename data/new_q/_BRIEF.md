# Writing new trivia questions (Hebrew)

The game: a Hebrew multiple-choice trivia app played by Haredi (ultra-Orthodox) couples aged 30–40 from Bnei Brak, on phones, 15 seconds a question. The bank already has 3,711 questions (data/new_q/_bank.json: fields t=topic, q, a with the correct answer first). We are adding ~500 new ones.

Output: a JSON array in your file, each item exactly:
{"topic": "<the exact topic name you were given>", "q": "<question>", "a": ["<correct>", "<wrong>", "<wrong>", "<wrong>"]}
The correct answer is ALWAYS first (the app shuffles). Exactly 4 different answers. UTF-8, valid JSON.

Quality rules (these matter more than speed):
- Facts must be correct and stable. If not 100% sure, check with WebSearch, or drop the question. No "current" facts that may change unless dated in the question ("נכון ל-2025").
- Interesting, "wow" or fun to argue about; medium difficulty. Not trivially easy ("what color is the sky"), not obscure-expert.
- The question must not give away the answer (no shared root word, no hint).
- Wrong answers must be plausible and the same kind as the right one (all cities / all numbers of similar size / all rabbis …). Keep answers short (under ~35 chars).
- Natural, short Hebrew; one line; ends with "?" (riddle formats like "X:Y = Z:?" are fine).
- Audience-appropriate: no TV/film/secular-celebrity/pop-culture/sports-celebrity-gossip, nothing immodest, no violence detail, no politics opinion (factual politics is fine), nothing disrespectful to rabbis or Torah. No Hungary/Budapest questions (separate topic, not yours).
- No duplicates: after writing, run `python3 /home/claude/budapest-app/data/new_q/_dupcheck.py <your file>` and replace every real duplicate (same fact as an existing question, even if worded differently). Re-run until clean. Also don't repeat a fact twice inside your own file.
- Do not edit any other file, do not run git.

Finish by replying with: the file path, how many questions, and anything you dropped or were unsure about.
