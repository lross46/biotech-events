# Weekly event update (instructions for Claude)

This file is the prompt for the weekly scheduled Claude routine that keeps `site/data/events.json` current.
To move the job to another Claude account: connect that account to this repo, create a weekly routine whose
prompt is "Follow UPDATING.md in the biotech-events repo", then delete the old routine.

## Goal

Keep a trustworthy list of biotech-related conferences, symposia, webinars, trade shows, investor/partnering
events and workshops worldwide (in person and online), covering **today to 18 months ahead**, each with a
short summary and per-sector relevance scores. Aim for 100–250 upcoming events.

## Steps

1. Read `site/data/events.json` and `scripts/check-data.mjs` (it defines the allowed values for `type`,
   `format`, `region` and the sector ids).
2. **Prune:** delete events whose end date is more than 60 days in the past.
3. **Re-check:** for upcoming events whose `checked` date is more than 60 days old, or which start in the next
   30 days, confirm dates, place and URL on the official site. Fix anything that changed (cancelled →
   delete; postponed → new dates). Set `checked` to today.
4. **Find new events.** Search the web for upcoming events in every sector, favouring gaps:
   - sectors or regions with fewer than ~8 upcoming events scoring 5+ (run the check script to see counts),
   - Asia-Pacific, Latin America, Middle East & Africa,
   - webinars and online events in the next 2–3 months,
   - next editions of big recurring events once their dates are announced (look 18 months ahead).
   Good sources: official society/organiser sites, Informa Connect, Terrapinn, Labroots, BIA, BIO, EBD Group,
   BioCentury, Cambridge Healthtech Institute, Gordon Research Conferences, national biotech associations.
5. **Only add an event when** its dates and city are stated on the official site, or on two independent
   listings if the official site cannot be read. Use the official event URL (https). Never guess dates.
6. For each event fill in: `id` (lowercase-dashes, include the year), `name`, `start`/`end` (YYYY-MM-DD),
   `time` (webinars only, e.g. "16:00 CET"), `type`, `format`, `region`, `city`, `country` (omit both for
   online), `organiser`, `url`, `free` (true only if the site says free; false if paid; null if unknown),
   `summary`, `rel`, `keywords` (optional synonyms/acronyms people may search), `added` and `checked` (today).
7. **Summary:** 1–2 plain sentences on what the event is and who attends. Factual, no hype.
8. **Relevance (`rel`)**: score each of the 12 sectors that apply, 0–10, with one specific sentence (`why`)
   saying what about this event matters for that sector. Omit sectors scoring below 3.
   - 9–10: the sector is the event's core focus
   - 7–8: a major track or audience
   - 5–6: meaningful sessions, exhibitors or attendees
   - 3–4: some relevance
   Sectors: defence, biosecurity, healthcare, meddevices, pharma, diagnostics, ai, agrifood, industrial,
   bioprocessing, fermentation, investment. Fermentation covers precision, biomass and traditional
   fermentation; bioprocessing covers upstream/downstream manufacturing and CDMOs; industrial covers
   synthetic biology for chemicals, materials and biomanufacturing.
9. Set the top-level `updated` to the current UTC time (ISO 8601).
10. Run `node scripts/check-data.mjs` and fix every error it reports.
11. Before committing, set the commit identity so no personal email ends up in the public history:
   `git config user.name "lross46"` and `git config user.email "347590180+lross46@users.noreply.github.com"`.
   Commit to `main` with a message like `Weekly event update: +12 new, -4 past, 9 re-checked` and push.
    GitHub Actions then publishes the site.

Do not change the website code during the weekly update unless it is clearly broken.
