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
  the 14 sectors below. They asked for **well-evidenced sources only**. Accuracy beats coverage.

## Steps

1. `git pull` so you have the latest headlines. Read `news-ai.json`, `news-sources.json`,
   `scripts/check-news.mjs` (allowed values) and the stories in `news.json`.
2. **Review every story in `news.json` that has no entry in `news-ai.json` → `items`.** Add an entry keyed by
   the story's `id`, choosing one of:
   - `{"drop": true}` for noise: not about biotech or life sciences, ads, sponsored posts, event promotions,
     obituaries, routine personnel moves at small firms, job listings, investor-relations housekeeping (e.g. "to
     present at conference"), quarterly-results notices with no news, journal corrections and table-of-contents
     entries, and anything not written in English (the wires publish the same release in several languages;
     keep the English one).
     **Keep** editorials, comment and viewpoint pieces from any peer-reviewed journal in the source list when
     they argue something consequential for the field: they feed the app's "Science & discovery" category, which
     takes anything with `kind: "journal"` or `kind: "preprint"`. Give them `cat: "science"` (or `policy` when
     that is the subject).
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
     - `imp` (0–10): how much this matters **within its own part of biotech**, judged against that field's
       own news, not against drug development. A big precision-fermentation scale-up, a biomanufacturing
       breakthrough or a major synthetic-biology paper scores as high as an equally big drug result would in
       pharma; do not mark a story down because it is not about medicines, and do not mark a drug story up
       because pharma is the largest sector. 9–10: field-changing (major approval or rejection, very large
       deal, major policy shift, serious outbreak, a result that changes what its field can do). 7–8:
       important for its sector. 5–6: notable. 3–4: minor. Below 3: consider dropping.
     - `rel`: score each sector that applies 0–10 with one specific `why` sentence, exactly as for events
       (9–10 core focus, 7–8 major, 5–6 meaningful, 3–4 some). Omit sectors below 3. Sectors: defence,
       biosecurity, healthcare, meddevices, pharma, cellgene, diagnostics, tools, ai, agrifood, industrial,
       bioprocessing, fermentation, investment. `cellgene` is cell and gene therapy specifically (gene
       editing, CAR-T, AAV, mRNA medicines) and `tools` is research tools and platforms (instruments,
       sequencing, omics, reagents, lab automation); score them alongside `pharma`, not instead of it.
   Work in batches; there are usually 100–300 new stories a day. Be brief but never vague.
2b. **Event leads.** While reviewing (including stories you drop as event promotions), note every story that
   names an upcoming biotech, pharma, medtech or life-science conference, trade show, summit or partnering
   event. If it isn't already in `site/data/events.json` (check by name and dates), add it to
   `data/event-pipeline.json` → `leads` as `{"name": "…", "dates": "as stated, or null", "city": "… or null",
   "url": "<the story url>", "source": "<outlet>", "added": "YYYY-MM-DD"}`. Skip duplicates already in
   `leads`, and investor-relations notices like "X to present at Y". Don't add events to `events.json`
   yourself; the weekly event update checks and adds them. Commit the file together with your review.
3. **Scout** for important stories from the last 48 hours that the feeds missed. Search the web for each
   sector, and specifically for: Asia-Pacific (China, Japan, Korea, Singapore, India), EU and UK government and
   defence biotech news, biosecurity incidents, company press releases for large deals or trial results.
   The feeds lean heavily towards drugs, so on every scouting pass also open these news pages and pick up
   anything important from the last 48 hours on industrial, sustainable and agri-food biotech, synthetic
   biology and bioprocessing: SynBioBeta (`https://www.synbiobeta.com/read` and
   `https://www.synbiobeta.com/synthetic-bio-news`; it has no feed), GEN's bioprocessing pages, Green Queen,
   AgFunderNews and Biofuels Digest. Aim for two or three such stories a day when the news is there.
   For biosecurity, also check WHO Disease Outbreak News (`https://www.who.int/emergencies/disease-outbreak-news`;
   its feeds are out of date) and the Bulletin of the Atomic Scientists (its feed blocks automated readers).
   Add at most 15 a day to `extra`, each with every review field plus:
   `id` (lowercase-dashes, e.g. `2026-10-25-acme-buys-bioco`), `title`, `url` (https, the original source),
   `source` (outlet name), `kind`, `published` (ISO date-time).
   **Only from established sources:** outlets with named editors, a corrections policy and a record of
   accurate reporting; journals; government and regulator sites; company press releases (kind `pr`).
   Never use content farms, SEO aggregators, anonymous blogs, social media posts or partisan sites. Open the
   page and confirm the facts are there before adding. Skip anything already in `news.json` or `extra`.
4. **Brief:** set `brief` to `{"date": "<now ISO>", "points": [{"sec": "<section>", "text": "…", "ids": ["<story id>"]}]}`.
   Write **one point per section**, in the app's order, and leave a section out when nothing in it is worth a
   paragraph rather than padding it: `results` (trial results), `science` (science & discovery), `approvals`
   (approvals & regulators), `policy` (policy & pricing), `money` (deals & money), `companies` (companies),
   `biodef` (outbreaks & biosecurity).
   Each point is a **summary of that section's day**, not a pointer to its top story: two to four sentences
   that say what actually happened across the section's stories, led by the most important ones and naming
   the companies, drugs, regulators and numbers, then folding the rest in as a theme ("a heavy run of deals
   and financings", "earnings set the tone") instead of listing every headline. Say when a section was quiet.
   In the `science` point, include an industrial, sustainable, agri-food or bioprocessing finding when there
   was a notable one, since the app keeps one Science & discovery place for that side of biotech.
   Put in `ids` the two to four stories the paragraph leans on most, best first; the app turns them into
   links, so do not add more than four and do not repeat a development in another section's point.
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

The app's news screen groups the day's stories into seven news categories with two places each: trial results,
science & discovery, approvals & regulators, policy & pricing, deals & money, companies, and outbreaks &
biosecurity. A story lands in the first category whose rule it meets, and the rules read `cat` first, so the
`cat` you choose decides where it appears: `clinical` → trial results, `science` (or `kind` journal/preprint) →
science & discovery, `regulatory` → approvals, `policy` → policy & pricing, `deals`/`funding`/`contracts` →
deals & money, everything else (earnings, restructuring, layoffs, manufacturing, strategy) → companies.
A biosecurity or defence score of 6 or more overrides all of them. Tapping a category opens its full list, and
only reviewed stories appear, which is why every story needs a decision.

Do not change the website code during the daily review unless it is clearly broken.
