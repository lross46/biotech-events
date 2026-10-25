// Validates site/data/events.json before publishing, and reports whether it is stale.
// Exits 1 on invalid data so a bad update never goes live. Writes stale_days to GITHUB_OUTPUT.
import { readFileSync, appendFileSync } from "node:fs";

const SECTORS = ["defence", "biosecurity", "healthcare", "meddevices", "pharma", "diagnostics", "ai", "agrifood", "industrial", "bioprocessing", "fermentation", "investment"];
const TYPES = ["conference", "symposium", "webinar", "tradeshow", "partnering", "workshop"];
const FORMATS = ["inperson", "online", "hybrid"];
const REGIONS = ["europe", "uk", "namerica", "apac", "mena", "latam", "global"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const data = JSON.parse(readFileSync(new URL("../site/data/events.json", import.meta.url), "utf8"));
const errors = [];
const ids = new Set();
const err = (e, msg) => errors.push(`${e.id || e.name || "?"}: ${msg}`);

if (isNaN(new Date(data.updated))) errors.push("top-level 'updated' is missing or not a date");
if (!Array.isArray(data.events)) errors.push("'events' must be an array");

for (const e of data.events || []) {
  if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) err(e, "id must be lowercase letters, digits and dashes");
  if (ids.has(e.id)) err(e, "duplicate id");
  ids.add(e.id);
  for (const k of ["name", "summary", "url"]) if (!e[k]) err(e, `missing ${k}`);
  if (e.url && !/^https:\/\//.test(e.url)) err(e, "url must start with https://");
  if (!DAY.test(e.start || "")) err(e, "start must be YYYY-MM-DD");
  if (e.end && !DAY.test(e.end)) err(e, "end must be YYYY-MM-DD");
  if (e.end && e.end < e.start) err(e, "end is before start");
  if (!TYPES.includes(e.type)) err(e, `type must be one of ${TYPES.join(", ")}`);
  if (!FORMATS.includes(e.format)) err(e, `format must be one of ${FORMATS.join(", ")}`);
  if (!REGIONS.includes(e.region)) err(e, `region must be one of ${REGIONS.join(", ")}`);
  if (e.format !== "online" && !e.country) err(e, "in-person/hybrid events need a country");
  for (const [k, v] of Object.entries(e.rel || {})) {
    if (!SECTORS.includes(k)) err(e, `unknown sector '${k}'`);
    if (!Number.isInteger(v?.score) || v.score < 0 || v.score > 10) err(e, `${k}.score must be a whole number 0-10`);
    if (!v?.why) err(e, `${k}.why is missing`);
  }
  if (!Object.keys(e.rel || {}).length) err(e, "needs at least one sector in rel");
}

const today = new Date().toISOString().slice(0, 10);
const upcoming = (data.events || []).filter((e) => (e.end || e.start) >= today);
const staleDays = Math.floor((Date.now() - new Date(data.updated)) / 864e5);
console.log(`${data.events?.length ?? 0} events (${upcoming.length} upcoming), last updated ${data.updated} (${staleDays} days ago)`);
const per = Object.fromEntries(SECTORS.map((s) => [s, upcoming.filter((e) => (e.rel?.[s]?.score || 0) >= 5).length]));
console.log("Upcoming events scoring 5+ per sector:", per);

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stale_days=${staleDays}\n`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s) in events.json:\n- ` + errors.join("\n- "));
  process.exit(1);
}
