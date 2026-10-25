# Bio Radar

Biotech conferences, symposia, webinars, trade shows and investor events worldwide, with AI-written summaries
and relevance scores for 12 sectors (defence, biosecurity, healthcare, medical devices, pharma, diagnostics,
AI & data, agri & food, industrial biotech, bioprocessing, fermentation, investment).

Live site: https://lross46.github.io/biotech-events/

## How it works

- `site/` is the website (a single page that also installs as a phone app). Favourites are stored in each
  person's browser.
- `site/data/events.json` holds the events. A weekly Claude routine updates it by following
  [UPDATING.md](UPDATING.md).
- `.github/workflows/deploy.yml` checks the data with `scripts/check-data.mjs` and publishes the site to
  GitHub Pages on every change. It also runs daily and fails (which emails the repo owner) if the data has
  not been updated for more than 8 days. The site shows a warning banner in that case too.
