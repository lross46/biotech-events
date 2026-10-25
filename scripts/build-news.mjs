// Builds what the News tab loads: merges the headlines (news.json) with Claude's review (news-ai.json),
// removes stories marked as noise or duplicates, and splits the result so phones only download the last 2 weeks.
// Writes site/data/news-feed.json (last 14 days) and news-feed-archive.json (older). Run before publishing.
import { readFileSync, writeFileSync } from "node:fs";

const DIR = new URL("../site/data/", import.meta.url);
const RECENT_DAYS = 14;
const PREPRINT_MIN = 7;  // preprints are shown only once Claude scores them this high somewhere
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
const news = read("news.json"), ai = read("news-ai.json");

const byId = new Map();
for (const it of news.items || []) {
  const a = ai.items?.[it.id];
  const s = { ...it, ...(a || {}), reviewed: !!a };
  delete s.seen;
  if (a?.summary) delete s.snippet;  // the AI summary replaces the feed excerpt
  if (a) delete s.guess;
  byId.set(it.id, s);
}
for (const x of ai.extra || []) if (!byId.has(x.id)) byId.set(x.id, { ...x, reviewed: true, scouted: true });

for (const it of byId.values()) {
  const p = it.dup && byId.get(it.dup);
  if (p && !p.dup) (p.also ||= []).push({ source: it.source, url: it.url });
}
const best = (it) => Math.max(it.imp || 0, ...Object.values(it.rel || {}).map((v) => v.score || 0));
const items = [...byId.values()]
  .filter((it) => !it.drop && !(it.dup && byId.has(it.dup)) && (it.kind !== "preprint" || (it.reviewed && best(it) >= PREPRINT_MIN)))
  .map(({ drop, dup, ...it }) => it)
  .sort((a, b) => b.published.localeCompare(a.published));

const cut = new Date(Date.now() - RECENT_DAYS * 864e5).toISOString();
const head = { updated: news.updated, reviewed: ai.updated, feeds: news.feeds, brief: ai.brief };
const recent = items.filter((i) => i.published >= cut), older = items.filter((i) => i.published < cut);
const write = (f, o) => writeFileSync(new URL(f, DIR), JSON.stringify(o));
write("news-feed.json", { ...head, archived: older.length, items: recent });
write("news-feed-archive.json", { items: older });
console.log(`News feed built: ${recent.length} recent + ${older.length} archived stories (${byId.size - items.length} hidden as noise, duplicates or unscored preprints)`);
