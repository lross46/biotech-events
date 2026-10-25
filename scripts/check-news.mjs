// Validates the news files before publishing and reports how stale the daily Claude review is.
// Exits 1 on invalid data so a bad update never goes live. Writes news_stale_days to GITHUB_OUTPUT.
import { readFileSync, appendFileSync } from "node:fs";

const SECTORS = ["defence", "biosecurity", "healthcare", "meddevices", "pharma", "diagnostics", "ai", "agrifood", "industrial", "bioprocessing", "fermentation", "investment"];
const CATS = ["funding", "deals", "regulatory", "clinical", "science", "policy", "contracts", "other"];
const KINDS = ["journal", "official", "news", "science", "pr", "preprint"];
const read = (f) => JSON.parse(readFileSync(new URL(`../site/data/${f}`, import.meta.url), "utf8"));
const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const src = read("news-sources.json");
const news = read("news.json");
const ai = read("news-ai.json");

const srcIds = new Set();
for (const s of src.sources || []) {
  if (!/^[a-z0-9-]+$/.test(s.id || "")) err(`source ${s.name}`, "id must be lowercase letters, digits and dashes");
  if (srcIds.has(s.id)) err(`source ${s.id}`, "duplicate id");
  srcIds.add(s.id);
  if (!s.name || !/^https:\/\//.test(s.home || "")) err(`source ${s.id}`, "needs name and https home");
  if (!Array.isArray(s.feeds)) err(`source ${s.id}`, "feeds must be a list (may be empty)");
  if (!KINDS.includes(s.kind)) err(`source ${s.id}`, `kind must be one of ${KINDS.join(", ")}`);
  if (!["core", "trial"].includes(s.status)) err(`source ${s.id}`, "status must be core or trial");
  if (s.status === "trial" && !/^\d{4}-\d{2}-\d{2}$/.test(s.trialEnds || "")) err(`source ${s.id}`, "trial sources need trialEnds YYYY-MM-DD");
}

const ids = new Set((news.items || []).map((i) => i.id));
function checkReview(where, a) {
  if (a.drop) return;
  if (a.dup) { if (!ids.has(a.dup) && !(ai.extra || []).some((x) => x.id === a.dup)) err(where, `dup points to unknown story ${a.dup}`); return; }
  if (!a.summary) err(where, "missing summary");
  if (!CATS.includes(a.cat)) err(where, `cat must be one of ${CATS.join(", ")}`);
  if (!Number.isInteger(a.imp) || a.imp < 0 || a.imp > 10) err(where, "imp must be a whole number 0-10");
  for (const [k, v] of Object.entries(a.rel || {})) {
    if (!SECTORS.includes(k)) err(where, `unknown sector '${k}'`);
    if (!Number.isInteger(v?.score) || v.score < 0 || v.score > 10) err(where, `${k}.score must be a whole number 0-10`);
    if (!v?.why) err(where, `${k}.why is missing`);
  }
}
for (const [id, a] of Object.entries(ai.items || {})) checkReview(`review ${id}`, a);
for (const x of ai.extra || []) {
  const w = `extra ${x.id || x.title}`;
  if (!/^[a-z0-9-]+$/.test(x.id || "")) err(w, "id must be lowercase letters, digits and dashes");
  if (ids.has(x.id)) err(w, "id clashes with a feed story");
  if (!x.title || !x.source || !/^https:\/\//.test(x.url || "")) err(w, "needs title, source and https url");
  if (!KINDS.includes(x.kind)) err(w, `kind must be one of ${KINDS.join(", ")}`);
  if (isNaN(new Date(x.published))) err(w, "published must be a date");
  checkReview(w, x);
}
if (ai.brief) {
  if (isNaN(new Date(ai.brief.date))) err("brief", "date is missing");
  if (!Array.isArray(ai.brief.points) || ai.brief.points.some((p) => !p.text)) err("brief", "points must be a list of {text, ids}");
}

const days = (d) => (d && !isNaN(new Date(d)) ? Math.floor((Date.now() - new Date(d)) / 864e5) : 999);
const reviewStale = days(ai.updated);
const unreviewed = (news.items || []).filter((i) => !ai.items?.[i.id]).length;
const failing = Object.entries(news.feeds || {}).filter(([, f]) => f.error && days(f.lastOk) >= 2).map(([k]) => k);
console.log(`${news.items?.length ?? 0} feed stories (${unreviewed} awaiting review), ${ai.extra?.length ?? 0} scouted; headlines ${days(news.updated)} days old, review ${reviewStale} days old`);
if (failing.length) console.log(`Feeds failing for 2+ days: ${failing.join(", ")}`);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `news_stale_days=${news.items?.length ? reviewStale : 0}\n`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) in the news files:\n- ` + errors.join("\n- "));
  process.exit(1);
}
