# Bio Radar

Biotech conferences, symposia, webinars, trade shows and investor events worldwide, plus a News tab of biotech
news from vetted sources, with AI-written summaries and relevance scores for 14 sectors (defence, biosecurity, healthcare, medical devices, pharma,
cell & gene therapy, diagnostics, research tools & platforms, AI & data, agri & food, industrial biotech, bioprocessing,
fermentation, investment).

Live site: https://lross46.github.io/biotech-events/

## How it works

- `site/` is the website (a single page that also installs as a phone app). Favourites are stored in each
  person's browser.
- `site/data/events.json` holds the events. A weekly Claude routine updates it by following
  [UPDATING.md](UPDATING.md).
- `.github/workflows/deploy.yml` checks the data with `scripts/check-data.mjs` and publishes the site to
  GitHub Pages on every change. It also runs daily and fails (which emails the repo owner) if the data has
  not been updated for more than 8 days. The site shows a warning banner in that case too.

## News tab

- `site/data/news-sources.json` lists the news sources (news outlets, regulators, company press-release wires,
  journals, science news, bioRxiv) and the Google News searches. Each source's `kind` sets the evidence badge
  shown on its stories ("Peer-reviewed", "Official source", "Company claim", "Preprint · not peer-reviewed"…).
- `scripts/fetch-news.mjs` reads those feeds 4 times a day (GitHub Actions, free) into `site/data/news.json`.
- A daily Claude routine follows [NEWS-UPDATING.md](NEWS-UPDATING.md): it summarises and scores new stories,
  drops noise, merges duplicates, finds important stories the feeds missed, writes the daily brief and looks
  after the source list (new sources go on a 2-week trial). Its output is `site/data/news-ai.json`.
  Importance is scored within each story's own field rather than against drug news, and the review opens
  SynBioBeta and other industrial-biotech news pages directly because they have no usable feed.
- The news screen groups stories into seven categories with two places each, ranked by importance. In
  Science & discovery, one of the two places goes to industrial, sustainable, food or bioprocessing work
  (a story whose strongest sector is one of those) when a reviewed one is available, because most of the
  science in the feed is medical.
- `scripts/build-news.mjs` merges the two at publish time into `news-feed.json` (last 2 weeks, what phones load)
  and `news-feed-archive.json` (up to 90 days). `scripts/check-news.mjs` validates everything first, and the
  daily check fails (emailing the repo owner) if the Claude review hasn't run for more than 2 days.
