// Reads the feeds in site/data/news-sources.json and merges new stories into site/data/news.json.
// Runs 4 times a day on GitHub Actions; no Claude involved. Claude's daily review (NEWS-UPDATING.md) writes
// summaries and scores to news-ai.json, which this script only reads, to drop stories Claude marked as noise.
// Usage: node scripts/fetch-news.mjs [--dry]   (--dry prints a per-feed report and writes nothing)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const DIR = new URL("../site/data/", import.meta.url);
const KEEP_DAYS = 90;
const DROP_AFTER_DAYS = 2;    // stories Claude marked drop/dup are deleted after this long
const MAX_AGE_NEW = 14;       // ignore feed items older than this when first seen (journal back-issues etc.)
const SNIPPET = 320;
const DRY = process.argv.includes("--dry");

const readJson = (f, d) => (existsSync(new URL(f, DIR)) ? JSON.parse(readFileSync(new URL(f, DIR), "utf8")) : d);
const cfg = readJson("news-sources.json");
const news = readJson("news.json", { updated: null, items: [], feeds: {} });
const ai = readJson("news-ai.json", { items: {} });

/* ---------- keyword guesses (Claude replaces these with real scores) ---------- */
const BIO = /\b(biotech\w*|biolog\w*|bio-?\w*|gene|genes|genetic\w*|genom\w*|cells?|cellular|protein\w*|antibod\w*|vaccin\w*|drugs?|therap\w*|pharma\w*|clinical|trials?|fda|ema|mhra|pathogen\w*|virus\w*|viral|bacteri\w*|microb\w*|ferment\w*|enzym\w*|crispr|mrna|rna|dna|diagnos\w*|assay\w*|pandemic\w*|outbreak\w*|epidemic\w*|infect\w*|medical device\w*|medtech|oncolog\w*|cancer|tumou?r\w*|molecul\w*|peptide\w*|synthetic biology|cultivated meat|antimicrobial\w*|disease\w*|medicine\w*|biosecur\w*|biodefen[cs]e)\b/i;
const SECTOR_KW = {
  defence: /\b(defen[cs]e|military|dod|darpa|army|navy|nato|ministry of defen[cs]e|chemical and biological|cbrn|biodefen[cs]e|bioweapon\w*)\b/i,
  biosecurity: /\b(biosecur\w*|pandemic\w*|outbreak\w*|pathogen\w*|bird flu|h5n1|avian influenza|mpox|ebola|marburg|measles|preparedness|biosafety|gain[- ]of[- ]function|bioweapon\w*|surveillance)\b/i,
  healthcare: /\b(patients?|hospital\w*|nhs|health ?care|medicare|medicaid|clinic\w*|public health)\b/i,
  meddevices: /\b(medical devices?|medtech|implant\w*|510\(k\)|de novo|wearable\w*|surgical|stent\w*|catheter\w*)\b/i,
  pharma: /\b(drugs?|therap\w*|pharma\w*|phase (1|2|3|i|ii|iii)|trial\w*|antibod\w*|vaccin\w*|oncolog\w*|cancer|approv\w*|biologics?)\b/i,
  diagnostics: /\b(diagnos\w*|assay\w*|test(s|ing)?|biomarker\w*|screening|sequencing|liquid biops\w*|pcr)\b/i,
  ai: /\b(ai|artificial intelligence|machine learning|deep learning|algorithm\w*|alphafold|language model\w*|llm\w*|computational)\b/i,
  agrifood: /\b(food|crops?|agri\w*|farm\w*|livestock|cultivated meat|plant-based|alt[- ]protein|dairy|seed\w*)\b/i,
  industrial: /\b(synthetic biology|synbio|biomanufactur\w*|bio-?based|biofuel\w*|biomaterial\w*|chemicals?|enzym\w*|industrial biotech\w*)\b/i,
  bioprocessing: /\b(bioprocess\w*|cdmo\w*|cmo|manufactur\w*|bioreactor\w*|upstream|downstream|fill[- ]finish|scale[- ]up|gmp)\b/i,
  fermentation: /\b(ferment\w*|yeast|precision fermentation|biomass)\b/i,
  investment: /\b(funding|raises?|raised|series [a-e]|seed round|ipo|financing|investors?|acqui\w*|merger|deal|valuation|venture|spac)\b/i,
};
const CATS = [
  ["regulatory", /\b(fda|ema|mhra|approv\w*|clearance|cleared|authori[sz]\w*|label|crl|complete response|recall\w*|warning letter|chmp|breakthrough designation|fast track)\b/i],
  ["funding", /\b(raises?|raised|series [a-e]|seed (round|funding)|ipo|financing|funding round|private placement|grant\w*)\b/i],
  ["deals", /\b(acqui\w*|merger|merge|buyout|licens\w*|partnership|collaborat\w*|agreement|deal|joint venture|options? rights)\b/i],
  ["clinical", /\b(phase (1|2|3|i|ii|iii)|trial\w*|topline|readout|data from|patients? (dosed|enrolled)|endpoint)\b/i],
  ["contracts", /\b(contract\w*|barda|darpa|awarded|award|procurement|tender|ministry of defen[cs]e|dod)\b/i],
  ["policy", /\b(policy|bill|law|legislat\w*|congress|parliament|senate|government|executive order|tariff\w*|regulation|strategy|minister)\b/i],
  ["science", /\b(study|researchers?|scientists?|discover\w*|paper|journal|preprint|found that|reveals?|mechanism)\b/i],
];
function guess(text, kind) {
  const sectors = Object.entries(SECTOR_KW).filter(([, re]) => re.test(text)).map(([k]) => k);
  let cat = CATS.find(([, re]) => re.test(text))?.[0] || "other";
  if ((kind === "journal" || kind === "preprint") && cat !== "clinical") cat = "science";
  return { sectors, cat };
}

/* ---------- feed parsing (RSS 2.0, RSS 1.0/RDF, Atom) ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const cdata = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
// Feeds often escape their HTML, so decode, strip tags, then decode again.
const clean = (s) => decode(decode(cdata(s || "")).replace(/<[^>]*>/g, " ")).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
function tag(block, names) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m) return m[1];
  }
  return "";
}
function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  return blocks.map((b) => {
    let link = clean(tag(b, ["link"]));
    if (!link) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*>/i) || b.match(/<link[^>]*href=[^>]*>/i);
      link = alt ? decode(alt[0].match(/href=["']([^"']+)["']/i)?.[1] || "") : "";
    }
    if (!link) link = clean(tag(b, ["guid", "id"]));
    const src = b.match(/<source[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
    return {
      title: clean(tag(b, ["title"])),
      link: link.trim(),
      date: clean(tag(b, ["pubDate", "published", "dc:date", "updated", "prism:publicationDate"])),
      body: clean(tag(b, ["description", "summary", "content:encoded", "content"])),
      outlet: src ? { url: decode(src[1]), name: clean(src[2]) } : null,
    };
  });
}

// Some publishers refuse unknown bots, so a refused request is retried once with a browser user agent.
const UAS = ["Mozilla/5.0 (compatible; BioRadar/1.0; +https://lrossoni86.github.io/biotech-events/)", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"];
async function get(url, { feed = true } = {}) {
  let last;
  for (const ua of UAS) {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: "follow", headers: { "user-agent": ua, accept: "*/*" } });
    if (r.status === 403 || r.status === 406) { last = new Error(`HTTP ${r.status}`); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    // Some sites answer bots with an HTML login or challenge page instead of the feed.
    if (feed && !/<(rss|feed|rdf:RDF)[\s>]/i.test(text)) { last = new Error("not a feed"); continue; }
    return text;
  }
  throw last;
}

// bioRxiv has no working RSS, so read its public API: preprints posted in the last 2 days, kept by category.
async function biorxiv(src) {
  const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const cats = new Set((src.categories || []).map((c) => c.toLowerCase()));
  const out = [];
  for (let cursor = 0, total = 1; cursor < total && cursor < 1500; cursor += 100) {
    const j = JSON.parse(await get(`https://api.biorxiv.org/details/biorxiv/${day(2)}/${day(0)}/${cursor}`, { feed: false }));
    total = +(j.messages?.[0]?.total || 0);
    for (const p of j.collection || []) {
      if (cats.has(String(p.category).toLowerCase())) out.push({ title: p.title, link: `https://www.biorxiv.org/content/${p.doi}v${p.version}`, date: p.date, body: p.abstract || "" });
    }
  }
  return out;
}

/* ---------- helpers ---------- */
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const onDomain = (h, list) => list.some((d) => h === d || h.endsWith("." + d));
function canon(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|cmp|src|ref|rss|feed)/i.test(k)) x.searchParams.delete(k);
    x.hash = "";
    return x.toString().replace(/\/$/, "");
  } catch { return u; }
}
const idOf = (u) => createHash("sha1").update(canon(u)).digest("hex").slice(0, 12);
const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
function when(s) {
  const d = new Date(s);
  return isNaN(d) || d > Date.now() + 864e5 ? new Date() : d;
}

/* ---------- main ---------- */
const now = Date.now();
const byId = new Map(news.items.map((i) => [i.id, i]));
const titles = new Set(news.items.map((i) => normTitle(i.title)));
const status = {};
const report = [];
let added = 0;

function addItem(raw, src, extra = {}) {
  if (!raw.title || !/^https?:\/\//.test(raw.link)) return false;
  if (/\/(fr|de|es|it|nl|pt|ja|zh|ko|sv|da|fi|no)\//i.test(new URL(raw.link).pathname)) return false;  // translated press releases
  const url = raw.link.replace(/^http:/, "https:");
  const id = idOf(url);
  const nt = normTitle(raw.title);
  if (byId.has(id) || titles.has(nt)) return false;
  const pub = when(raw.date);
  if (now - pub > MAX_AGE_NEW * 864e5) return false;
  const text = `${raw.title} ${raw.body}`;
  if (src.filter && !BIO.test(text)) return false;
  const g = guess(text, src.kind);
  const item = {
    id, title: raw.title.slice(0, 300), url, source: src.name, sourceId: src.id, kind: src.kind,
    published: pub.toISOString(), seen: new Date(now).toISOString(),
    snippet: raw.body.length > SNIPPET ? raw.body.slice(0, SNIPPET).replace(/\s\S*$/, "") + "…" : raw.body,
    guess: g, ...extra,
  };
  if (!item.snippet) delete item.snippet;
  byId.set(id, item); titles.add(nt); added++;
  return true;
}

async function runSource(src) {
  const st = { ok: 0, fail: 0, items: 0, added: 0, error: null };
  for (const feed of src.api ? [src.api] : src.feeds) {
    try {
      const items = src.api === "biorxiv" ? await biorxiv(src) : parseFeed(await get(feed));
      st.ok++; st.items += items.length;
      const recent = items.sort((a, b) => when(b.date) - when(a.date)).slice(0, src.cap || 60);
      for (const it of recent) if (addItem(it, src)) st.added++;
    } catch (e) { st.fail++; st.error = `${e.name === "TimeoutError" ? "timeout" : e.message} (${feed})`; }
  }
  const prev = news.feeds?.[src.id] || {};
  status[src.id] = { lastOk: st.ok ? new Date(now).toISOString() : prev.lastOk || null, error: st.fail ? st.error : null, lastAdded: st.added };
  report.push(`${st.fail ? (st.ok ? "PART" : "FAIL") : "ok  "} ${src.id.padEnd(16)} items=${String(st.items).padStart(3)} new=${String(st.added).padStart(3)}${st.error ? "  " + st.error : ""}`);
}

async function runGoogle() {
  const g = cfg.google || { queries: [] };
  const trusted = [...(g.trustedOutlets || []), ...cfg.sources.map((s) => host(s.home))];
  const bySite = cfg.sources.map((s) => [host(s.home), s]);
  let items = 0, kept = 0, fails = 0, error = null;
  for (const q of g.queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:2d")}&hl=en-GB&gl=GB&ceid=GB:en`;
    try {
      for (const it of parseFeed(await get(url))) {
        items++;
        const h = host(it.outlet?.url || "");
        if (!h || !onDomain(h, trusted)) continue;
        // Google titles end in " - Outlet"; a listed source keeps its own evidence label.
        const own = bySite.find(([d]) => d && onDomain(h, [d]))?.[1];
        const name = it.outlet.name || h;
        it.body = "";  // Google's description just repeats the headline
        it.title = it.title.replace(new RegExp(`\\s+-\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "");
        const src = { id: "google", name, kind: own?.kind || (onDomain(h, ["fda.gov", "ema.europa.eu", "gov.uk", "who.int", "cdc.gov", "nih.gov", "europa.eu"]) ? "official" : "news"), filter: true };
        if (addItem(it, src, { via: "Google News" })) kept++;
      }
    } catch (e) { fails++; error = `${e.message} (query: ${q})`; }
  }
  status.google = { lastOk: fails < g.queries.length ? new Date(now).toISOString() : news.feeds?.google?.lastOk || null, error, lastAdded: kept };
  report.push(`${fails ? "PART" : "ok  "} ${"google".padEnd(16)} items=${String(items).padStart(3)} new=${String(kept).padStart(3)}${error ? "  " + error : ""}`);
}

const queue = cfg.sources.filter((s) => s.api || s.feeds?.length);  // feedless sources are covered by Claude's search
await Promise.all([runGoogle(), ...Array.from({ length: 6 }, async () => { while (queue.length) await runSource(queue.shift()); })]);

// Prune: keep 90 days; delete stories Claude marked as noise or duplicates once they're a couple of days old.
let pruned = 0;
for (const [id, it] of byId) {
  const age = (now - new Date(it.published)) / 864e5;
  const a = ai.items?.[id];
  if (age > KEEP_DAYS || ((a?.drop || a?.dup) && age > DROP_AFTER_DAYS)) { byId.delete(id); pruned++; }
}

const out = {
  updated: new Date(now).toISOString(),
  note: "Written by scripts/fetch-news.mjs. Do not edit by hand; Claude's review goes in news-ai.json.",
  feeds: { ...news.feeds, ...status },
  items: [...byId.values()].sort((a, b) => b.published.localeCompare(a.published)),
};
console.log(report.sort().join("\n"));
console.log(`\n${added} new, ${pruned} pruned, ${out.items.length} stories kept`);
if (!DRY) writeFileSync(new URL("news.json", DIR), JSON.stringify(out, null, 0).replace(/\},\{"id"/g, '},\n{"id"') + "\n");
