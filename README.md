# Scordle

Wordle, but scored. Same look and feel as the original — 5-letter word, 6 guesses, flip-tile reveals, green/yellow/gray feedback — plus a scoring layer that rewards *careful* play over *fast* play.

Play it live once GitHub Pages is enabled (see below), or just open `index.html` in a browser — it's a static site with zero build step and zero dependencies.

## The twist: scoring

| Tile | Points | Notes |
|---|---|---|
| 🟩 Green | **+10** | Only the *first* time that letter lands in that spot. Guess the same green again and it's worth **0** — no points for duplicate greens. |
| 🟨 Yellow | **+5** | Every time, even if you've already seen that letter go yellow. |
| ⬜ Gray | **0** | Always. |

Because duplicate greens are worthless, locking in a known letter too early caps your score. The strategic move is to keep shuffling letters you know are *in* the word into *new, wrong* spots — every fresh yellow is another 5 points — before finally committing to the real answer. You've still only got 6 guesses, so there's a real risk/reward tension between milking yellows for score and running out of attempts.

## Modes

- **Daily** — one puzzle per calendar day, same for everyone, tracked in your stats/streak (stored locally in your browser).
- **Practice** — unlimited random words, no streak impact, good for experimenting with scoring strategy.

## Tech

Plain HTML/CSS/JS, no framework, no build step, no backend. Word lists live in `words/`:

- `words/answers.js` — a curated pool of common 5-letter answer words.
- `words/valid-guesses.js` — an extended dictionary of valid 5-letter guesses (source: [tabatkins/wordle-list](https://github.com/tabatkins/wordle-list), MIT licensed), used for guess validation only.

Stats and daily progress persist in `localStorage`, so nothing to host beyond static files.

## Hosting for free with GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml`, which deploys the site to GitHub Pages automatically on every push to `main`.

To turn it on:

1. Merge this branch into `main`.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. Push to `main` (or re-run the workflow from the **Actions** tab) — the site will publish to `https://<your-username>.github.io/<repo-name>/`.

No other configuration, secrets, or paid services required.
