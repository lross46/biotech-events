// Compares big event listing sites against our list and writes events we don't have yet to
// data/event-pipeline.json → `candidates`. Runs weekly on GitHub Actions (Sunday, before the Monday Claude
// update); no Claude involved. The weekly update (UPDATING.md step 1b) checks each candidate on the official
// site, adds the ones that qualify and moves the rest to `dismissed` so they are not flagged again.
// Sources live in data/listing-sources.json. Each page is read for schema.org Event data (JSON-LD), which most
// listing sites embed for search engines; a page without it simply yields 0 and is reported in the log.
// Usage: node scripts/scan-listings.mjs [--dry]   (--dry prints the report and writes nothing)
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const root = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => JSON.parse(readFileSync(root(p), "utf8"));
const sources = read("data/listing-sources.json").sources;
const pipe = read("data/event-pipeline.json");
const events = read("site/data/events.json").events;

const today = new Date().toISOString().slice(0, 10);
const horizon = new Date(Date.now() + 548 * 864e5).toISOString().slice(0, 10); // ~18 months
const MAX_CANDIDATES = 150;
const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ---------- name matching ---------- */
const STOP = new Set(["the", "and", "of", "for", "in", "on", "at", "a", "an", "to", "&", "annual", "international",
  "conference", "congress", "summit", "meeting", "forum", "expo", "exhibition", "show", "event", "symposium", "edition"]);
const words = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(19|20)\d\d\b/g, " ").replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !STOP.has(w));
const squash = (s) => words(s).join("");
function similar(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return false;
  const sa = squash(a), sb = squash(b);
  if (sa.length >= 5 && sb.length >= 5 && (sa.includes(sb) || sb.includes(sa))) return true;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.min(A.size, B.size) >= 0.75;
}
const known = [
  ...events.flatMap((e) => [e.name, ...(e.keywords || []).filter((k) => k.length > 6)]),
  ...pipe.watch.map((w) => w.series),
  ...(pipe.leads || []).map((l) => l.name),
  ...(pipe.dismissed || []).map((d) => d.name),
];
const isKnown = (name) => known.some((k) => similar(name, k));

/* ---------- schema.org Event extraction ---------- */
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
function* walk(node) {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === "object") {
    const t = [].concat(node["@type"] || []);
    if (t.some((x) => /Event$/.test(x))) yield node;
    for (const k of ["@graph", "itemListElement", "item", "mainEntity", "subEvent", "event", "events"]) if (node[k]) yield* walk(node[k]);
  }
}
function place(ev) {
  const loc = [].concat(ev.location || [])[0] || {};
  if (/VirtualLocation/.test(loc["@type"] || "")) return { city: "", country: "", online: true };
  const a = typeof loc.address === "string" ? { addressLocality: loc.address } : loc.address || {};
  const country = typeof a.addressCountry === "object" ? a.addressCountry.name : a.addressCountry;
  return { city: decode(a.addressLocality || loc.name || ""), country: decode(country || ""), online: false };
}
function extract(html, base) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    for (const ev of walk(data)) {
      const start = String(ev.startDate || "").slice(0, 10);
      const name = decode(ev.name);
      if (!name || !/^\d{4}-\d\d-\d\d$/.test(start)) continue;
      let url = "";
      try { url = new URL(ev.url || "", base).href; } catch {}
      out.push({ name, start, end: String(ev.endDate || "").slice(0, 10) || start, url, ...place(ev) });
    }
  }
  return out;
}

/* ---------- run ---------- */
const found = new Map();
const report = [];
for (const s of sources) {
  let n = 0, status = "";
  try {
    const r = await fetch(s.url, { signal: AbortSignal.timeout(30000), redirect: "follow",
      headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml", "accept-language": "en" } });
    status = String(r.status);
    if (r.ok) {
      for (const ev of extract(await r.text(), s.url)) {
        n++;
        if (ev.start < today || ev.start > horizon) continue;
        const key = squash(ev.name) + ev.start.slice(0, 7);
        if (!found.has(key)) found.set(key, { ...ev, source: s.name });
      }
    }
  } catch (e) {
    status = e.name === "TimeoutError" ? "timeout" : e.message.slice(0, 60);
  }
  report.push(`${s.name}: HTTP ${status}, ${n} events on page`);
  await new Promise((r) => setTimeout(r, 1500)); // be polite
}

const old = new Map((pipe.candidates || []).map((c) => [squash(c.name) + c.start.slice(0, 7), c]));
const fresh = [...found.values()].filter((c) => !isKnown(c.name));
const merged = new Map([...old].filter(([, c]) => c.start >= today && !isKnown(c.name)));
let added = 0;
for (const c of fresh) {
  const key = squash(c.name) + c.start.slice(0, 7);
  if (!merged.has(key)) { merged.set(key, { ...c, seen: today }); added++; }
}
const candidates = [...merged.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, MAX_CANDIDATES);

console.log(report.join("\n"));
console.log(`\n${found.size} upcoming events read, ${fresh.length} not in our list, ${added} new candidates, ${candidates.length} waiting for review.`);
for (const c of candidates.filter((c) => c.seen === today)) console.log(`  + ${c.start} ${c.name} (${c.city || (c.online ? "online" : "?")}) [${c.source}]`);

if (!DRY) {
  pipe.candidates = candidates;
  pipe.lastListingScan = today;
  pipe.listingScanReport = report;
  writeFileSync(root("data/event-pipeline.json"), JSON.stringify(pipe, null, 1) + "\n");
}
