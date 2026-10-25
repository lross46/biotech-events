// Temporary helper: tries candidate feed URLs with two user agents and prints what comes back.
const urls = process.argv.slice(2);
const UAS = ["Mozilla/5.0 (compatible; BioRadar/1.0; +https://lrossoni86.github.io/biotech-events/)", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"];
for (const u of urls) {
  for (const [i, ua] of UAS.entries()) {
    try {
      const r = await fetch(u, { headers: { "user-agent": ua, accept: "*/*" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      const n = (t.match(/<(item|entry)[\s>]/gi) || []).length;
      const first = (t.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/i) || [""])[0].replace(/\s+/g, " ").slice(0, 260);
      console.log(`ua${i} ${r.status} items=${n} ${r.url}\n    ${n ? first : t.slice(0, 120).replace(/\s+/g, " ")}`);
      if (r.ok && n) break;
    } catch (e) { console.log(`ua${i} ERR ${e.message} ${u}`); }
  }
}
