# Daily news review (instructions for Claude)

This file is the prompt for the daily scheduled Claude routine that reviews the news in Bio Radar's News tab.
To move the job to another Claude account: connect that account to this repo, create a daily routine whose
prompt is "Follow NEWS-UPDATING.md in the biotech-events repo", then delete the old routine.

## How the news works

- `site/data/news-sources.json` lists the sources. GitHub Actions runs `scripts/fetch-news.mjs` 4 times a day,
  which reads their feeds plus Google News searches and writes the headlines to `site/data/news.json`.
  **Never edit `news.json`**: the fetcher owns it and rewrites it every 6 hours.
- You own `site/data/news-ai.json` (your review) and maintain `site/data/news-sources.json` (the source list).
- The readers are the owner and their colleagues: biotech professionals who want to know what changed and why it matters for
  the 12 sectors below. They asked for **well-evidenced sources only**. Accuracy beats coverage.

## Steps

1. `git pull` so you have the latest headlines. Read `news-ai.json`, `news-sources.json`,
   `scripts/check-news.mjs` (allowed values) and the stories in `news.json`.
2. **Review every story in `news.json` that has no entry in `news-ai.json` → `items`.** Add an entry keyed by
   the story's `id`, choosing one of:
   - `{"drop": true}` for noise: not about biotech or life sciences, ads, sponsored posts, event promotions,
     obituaries, routine personnel moves at small firms, job listings, investor-relations housekeeping (e.g. "to
     present at conference"), quarterly-results notices with no news, and journal items that are corrections,
     editorials of no consequence or table-of-contents entries.
   - `{"dup": "<id of the best version>"}` when another story covers the same news. Keep as primary the most
     authoritative source in this order: journal / official source → established news outlet → science news →
     press release → preprint; between equals, the more detailed one.
   - A full review:
     ```json
     {"cat": "deals", "imp": 7, "summary": "…", "rel": {"pharma": {"score": 8, "why": "…"}}}
     ```
     - `summary`: 1–2 plain sentences on what happened, with the key number (amount, phase, endpoint, date) when
       there is one. Write only what the source says. If the title and snippet are too thin, open the article
       (`url`); if it is paywalled, summarise only what is visible and do not guess. For press releases
       (`kind: "pr"`) attribute claims ("X says its drug cut…"). For preprints add "Not yet peer-reviewed."
     - `cat`: funding, deals, regulatory, clinical, science, policy, contracts or other.
     - `imp` (0–10): how much this matters to the biotech industry as a whole. 9–10: field-changing (major
       approval or rejection, very large deal, major policy shift, serious outbreak). 7–8: important for a
       sector. 5–6: notable. 3–4: minor. Below 3: consider dropping.
     - `rel`: score each sector that applies 0–10 with one specific `why` sentence, exactly as for events
       (9–10 core focus, 7–8 major, 5–6 meaningful, 3–4 some). Omit sectors below 3. Sectors: defence,
       biosecurity, healthcare, meddevices, pharma, diagnostics, ai, agrifood, industrial, bioprocessing,
       fermentation, investment.
   Work in batches; there are usually 100–300 new stories a day. Be brief but never vague.
3. **Scout** for important stories from the last 48 hours that the feeds missed. Search the web for each
   sector, and specifically for: Asia-Pacific (China, Japan, Korea, Singapore, India), EU and UK government and
   defence biotech news, biosecurity incidents, company press releases for large deals or trial results.
   Add at most 15 a day to `extra`, each with every review field plus:
   `id` (lowercase-dashes, e.g. `2026-10-25-acme-buys-bioco`), `title`, `url` (https, the original source),
   `source` (outlet name), `kind`, `published` (ISO date-time).
   **Only from established sources:** outlets with named editors, a corrections policy and a record of
   accurate reporting; journals; government and regulator sites; company press releases (kind `pr`).
   Never use content farms, SEO aggregators, anonymous blogs, social media posts or partisan sites. Open the
   page and confirm the facts are there before adding. Skip anything already in `news.json` or `extra`.
4. **Brief:** set `brief` to `{"date": "<now ISO>", "points": [{"text": "…", "ids": ["<story id>"]}]}` with
   3–6 points: the most important developments since the last brief, one sentence each, each pointing to its
   best story. Favour breadth across sectors over five stories about one drug.
5. **Prune:** delete `items` entries whose id is no longer in `news.json`, and `extra` entries older than 90 days.
6. **Sources** (`news-sources.json`):
   - Feeds failing: `news.json` → `feeds` shows `error` and `lastOk` per source. For a source failing for 2+ days,
     find its current feed URL and fix `feeds`. If it no longer has a feed, set `feeds` to `[]` and note it.
   - New sources: if you scouted 2+ good stories from the same established outlet that is not listed, and it
     has an RSS/Atom feed, add it with `"status": "trial"`, `"added"` and `"trialEnds"` (+14 days), `"why"` (one
     line on what it adds), the right `kind`, and `"filter": true` if it covers more than biotech.
     At most 2 new trial sources a week. Same evidence rules as scouting.
   - Trial ends: when `trialEnds` has passed, look at that source's reviewed stories. Keep it (`"status": "core"`,
     remove `trialEnds`) if they were mostly kept and relevant; otherwise remove the source.
   - Record every change in `log` as `{"date": "YYYY-MM-DD", "text": "Added X on trial: …"}`; keep the last 50.
   - Never remove a source the owner added, and do not change the Google News `trustedOutlets` except to add an
     established outlet.
7. Set `updated` in `news-ai.json` (and in `news-sources.json` if you changed it) to the current UTC time.
8. Run `node scripts/check-news.mjs` and fix every error.
9. Before committing, set the commit identity so no personal email ends up in the public history:
   `git config user.name "lross46"` and
   `git config user.email "347590180+lross46@users.noreply.github.com"`.
   Commit with a message like `Daily news review: 212 reviewed (61 dropped, 18 duplicates), 7 scouted` and push
   to `main`. If the push is rejected because the headline job pushed meanwhile, `git pull --rebase` and push
   again (you never touch the same file, so there is nothing to merge).
10. **On Mondays only**, post one short message to the owner in your thread: sources added, kept, or removed in the
    last 7 days (from `log`), one line each with the reason, and "Reply 'remove X' to drop one." If nothing
    changed, say so in one line. Other days, no message is needed unless something is broken.

Do not change the website code during the daily review unless it is clearly broken.
