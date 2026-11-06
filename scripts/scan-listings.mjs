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
const ENT = { amp: "&", apos: "'", quot: '"', lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: "…", eacute: "é", uuml: "ü", ouml: "ö", auml: "ä" };
const entities = (s) => String(s || "").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const decode = (s) => entities(entities(s)).replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
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

/* ---------- fallback: event-like links with a date next to them (pages without JSON-LD) ---------- */
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const M = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const DATE_RES = [
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*\\d{1,2}(?:st|nd|rd|th)?)?\\s+${M}\\s+(20\\d\\d)\\b`, "i"), (m) => [m[3], MON[m[2].toLowerCase()], m[1]]],
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${M}\\s*[-–]\\s*\\d{1,2}(?:st|nd|rd|th)?\\s+${M}\\s+(20\\d\\d)\\b`, "i"), (m) => [m[4], MON[m[2].toLowerCase()], m[1]]],
  [new RegExp(`\\b${M}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*(?:${M}\\s+)?\\d{1,2})?,?\\s+(20\\d\\d)\\b`, "i"), (m) => [m[4], MON[m[1].toLowerCase()], m[2]]],
  [/\b(20\d\d)-(\d\d)-(\d\d)\b/, (m) => [m[1], +m[2], m[3]]],
  [/\b(\d{1,2})\.(\d{1,2})\.(?:\s*[-–]\s*\d{1,2}\.\d{1,2}\.)?\s*(20\d\d)\b/, (m) => [m[3], +m[2], m[1]]],
];
function findDate(text) {
  let best = null;
  for (const [re, f] of DATE_RES) {
    const m = text.match(re);
    if (!m) continue;
    const [y, mo, d] = f(m);
    if (!mo || mo > 12 || +d < 1 || +d > 31) continue;
    if (!best || m.index < best.at) best = { at: m.index, date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
  }
  return best?.date || "";
}
const GENERIC = /^(read more|more|details|register|book now|learn more|view|view event|see event|see more|find out more|info|tickets?|website|visit website|more info|home|next|previous|apply now|post a job|recruiters guide|follow us|contact us|privacy policy|more \w+\s*(\.\.\.|…)?)$/i;
const BIOISH = /bio|pharma|life ?science|medic|health|genom|diagnos|\blab\b|laborator|\bcells?\b|\bcellular|\bgene\b|\bgenes\b|genetic|vaccin|\bdrug|clinic|omics?\b|ferment|synth|medtech|crispr|\brna\b|\bdna\b|protein|antibod|oncolog|cancer|patholog|biosecur|cbrn|neuro|immun|chemi|nutraceut|cosmetic science|precision medicine|therapeut/i;
// Cut dates, "Find out more" and similar tails that some listings put inside the link text.
const cleanName = (n) => n.replace(/\s*\|\s*/g, " ").split(/\s*(?:\d{1,2}(?:st|nd|rd|th)?\s*[-–]\s*\d{1,2}\s+[a-z]{3}|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d\d|find out more|read more|learn more|book now)/i)[0]
  .replace(/^\d{1,2}\s+[a-z]+\s+20\d\d\s*[-–]\s*/i, "").replace(/(\D)(20\d\d)\s*$/, "$1 $2").replace(/\s+/g, " ").trim();
function extractLinks(html, base, filter) {
  const body = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
  const anchors = [];
  const flat = body.replace(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    anchors.push({ href, name: decode(inner) });
    return ` \u0001${anchors.length - 1}\u0002 ${decode(inner)} \u0003 `;
  }).replace(/<[^>]+>/g, " | ");
  const text = decode(flat.replace(/\u0001\d+\u0002/g, (t) => t)); // keep markers
  const out = [];
  const seen = new Set();
  for (const mk of text.matchAll(/\u0001(\d+)\u0002/g)) {
    const a = anchors[+mk[1]];
    const name = a.name;
    if (!name || name.length < 8 || name.length > 140 || GENERIC.test(name) || name.split(" ").length < 2) continue;
    if (filter && !BIOISH.test(name)) continue;
    // Date in the link itself or after it (up to the next link), else just before it (tables with a date column).
    const after = text.slice(mk.index + mk[0].length, mk.index + 400);
    const nextLink = after.search(/\u0001\d+\u0002/);
    const own = (name + " " + (nextLink >= 0 ? after.slice(0, nextLink) : after)).slice(0, 400);
    const win = text.slice(Math.max(0, mk.index - 120), mk.index);
    const before = win.slice(win.lastIndexOf("\u0003") + 1).replace(/\u0001\d+\u0002/g, " ");
    const spaced = (t) => t.replace(/\u0003/g, " ").replace(/([a-z])(\d)/gi, "$1 $2").replace(/(20\d\d)(\d{1,2}\s*[-–])/g, "$1 $2");
    const start = findDate(spaced(own)) || findDate(spaced(before));
    if (!start) continue;
    let url = "";
    try { url = new URL(a.href, base).href; } catch {}
    const key = squash(name) + start;
    if (seen.has(key)) continue;
    seen.add(key);
    const clean = cleanName(name);
    if (clean.length < 8 || GENERIC.test(clean) || (filter && !BIOISH.test(clean))) continue;
    out.push({ name: clean, start, end: start, url, city: "", country: "", online: false, guessed: true });
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
      const html = await r.text();
      let evs = extract(html, s.url);
      if (!evs.length) evs = extractLinks(html, s.url, s.filter);
      if (process.env.SCAN_DEBUG) console.log(`--- ${s.name}: ${html.length} bytes; sample:`, evs.slice(0, 4).map((e) => `${e.start} ${e.name}`));
      for (const ev of evs) {
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
