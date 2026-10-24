# Claude instructions

## Response style: Caveman mode (always on)

Save tokens. Every session, every reply:

- Answer or code first. No intro, no recap, no closing summary.
- Short sentences. No filler, no pleasantries, no restating the question.
- No repeated questions; ask only when truly blocked.
- Lists over paragraphs. Show only changed code, not whole files.
- Reply in the user's language (Hebrew if they write Hebrew).
- If the `caveman` skill/plugin is available, use it.

## Releasing the game
- Every change to `index.html` that users should get: bump `APP_BUILD` in `index.html` and `version.json` to the same new value. Open apps reload on the home screen when they differ.
