const { spawn } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9273;
const DIR = __dirname;
const ROOT = "D:/shimais-daming/frontend";
const KEY = "shimais-daming:progress:v1";
const D = vm.runInNewContext(fs.readFileSync(ROOT + "/data.js", "utf8") + "\n;SITE_DATA", {});
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud35`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1200); };
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + name + ".png", Buffer.from(s.data, "base64")); };

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200));
  };
  await send("Runtime.enable"); await send("Page.enable");

  // index entry
  await nav("http://127.0.0.1:4173/index.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/index.html");
  const entry = await evalJs(`(() => { const e = document.querySelector('.ch-entry'); if (!e) return null; const q = document.querySelector('.question-section'); const en = document.querySelector('.entries-section'); return { title: e.querySelector('.ch-entry-title').textContent, desc: e.querySelector('.ch-entry-desc').textContent, btn: e.querySelector('.cta-button').textContent, href: e.querySelector('.cta-button').getAttribute('href'), afterQuestion: !!(q.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING), beforeEntries: !!(e.compareDocumentPosition(en) & Node.DOCUMENT_POSITION_FOLLOWING), moduleEntries: document.querySelectorAll('.entry-block').length }; })()`);
  check("index entry block verbatim, between question and entries", entry && entry.title === "白话明史 · 洪武朝" && entry.desc === "用白话把洪武朝从头讲一遍——建国、废相、锦衣卫与晚年大狱，全文依据本站已核材料。" && entry.btn === "开始试读" && entry.href === "chapter.html" && entry.afterQuestion && entry.beforeEntries && entry.moduleEntries === 6, JSON.stringify(entry));
  const before = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  const entryTarget = await evalJs(`(() => { const a = document.querySelector('.ch-entry .cta-button'); return { href: a.getAttribute('href'), target: a.target }; })()`);
  check("entry button targets chapter.html in a new tab", entryTarget.href === "chapter.html" && entryTarget.target === "_blank", JSON.stringify(entryTarget));
  await nav("http://127.0.0.1:4173/chapter.html");

  // chapter render verbatim
  const ch = await evalJs(`(() => ({
    head: document.querySelector('.head-title').textContent,
    intro: document.querySelector('.ch-intro').textContent,
    secs: [...document.querySelectorAll('.ch-section')].map(s => ({ title: s.querySelector('.ch-sec-title').textContent, ps: [...s.querySelectorAll('.ch-p')].map(p => p.textContent), source: s.querySelector('.ch-source').textContent })),
    next: [...document.querySelectorAll('.ch-next-link')].map(a => [a.textContent, a.getAttribute('href')]),
    nextTitle: [...document.querySelectorAll('.ch-sec-title')].pop().textContent,
    nav: document.querySelectorAll('.nav-link').length,
    readW: Math.round(document.querySelector('.ch-read').getBoundingClientRect().width),
    secFont: getComputedStyle(document.querySelector('.ch-sec-title')).fontFamily,
    pFont: getComputedStyle(document.querySelector('.ch-p')).fontFamily,
    pSize: getComputedStyle(document.querySelector('.ch-p')).fontSize,
    srcSize: getComputedStyle(document.querySelector('.ch-source')).fontSize
  }))()`);
  const verbatim = ch.intro === D.chapters[0].intro && ch.secs.length === 5 && ch.secs.every((s, i) => s.title === D.chapters[0].sections[i].title && JSON.stringify(s.ps) === JSON.stringify(D.chapters[0].sections[i].paragraphs) && s.source === "本节依据：" + D.chapters[0].sections[i].sourceNote);
  check("chapter: head/intro/5 sections/paragraphs/sources verbatim", verbatim && ch.head === "白话明史 · 洪武朝", JSON.stringify([ch.head, ch.secs.map((s) => s.title)]));
  check("chapter: next three links + title", ch.nextTitle === "下一步" && JSON.stringify(ch.next) === JSON.stringify(D.chapters[0].nextSteps.map((l) => [l.label, l.href])), JSON.stringify(ch.next));
  check("chapter: nav 10, narrow column, serif titles sans body 16px, source 13px", ch.nav === 10 && ch.readW <= 720 && /Serif SC|FangSong|serif/.test(ch.secFont) && /PingFang|YaHei|Sans SC|sans-serif/.test(ch.pFont) && ch.pSize === "16px" && ch.srcSize === "13px", JSON.stringify([ch.nav, ch.readW, ch.pSize, ch.srcSize]));
  check("chapter visit writes no progress", (await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`)) === before, "changed");
  const nums = await evalJs(`document.querySelector('.ch-read').textContent`);
  check("key figures present verbatim", ["三万余人", "七十余口", "五十一", "六十一", "1392", "六十两"].every((n) => nums.includes(n)), "missing");
  await shot("chapter-desktop");
  await evalJs(`document.querySelectorAll('.ch-section')[3].scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(300);
  await shot("chapter-desktop-s4");

  // next links land correctly (qinli link opens a new tab per AP)
  const nl1 = await evalJs(`(() => { const a = document.querySelectorAll('.ch-next-link')[0]; return { href: a.getAttribute('href'), target: a.target, rel: a.rel }; })()`);
  check("next link 1 targets q1380 in a new tab", nl1.href === "qinli-play.html?story=q1380" && nl1.target === "_blank" && nl1.rel === "noopener", JSON.stringify(nl1));
  await nav("http://127.0.0.1:4173/qinli-play.html?story=q1380");
  const q1 = await evalJs(`(() => ({ path: location.pathname + location.search, label: document.querySelector('.ql-scene-label') ? document.querySelector('.ql-scene-label').textContent : null }))()`);
  check("next link 1 destination q1380 scene 1", q1.path.endsWith("qinli-play.html?story=q1380") && /第一场/.test(q1.label || ""), JSON.stringify(q1));
  await nav("http://127.0.0.1:4173/chapter.html");
  await evalJs(`document.querySelectorAll('.ch-next-link')[1].click()`);
  await sleep(1200);
  const c1 = await evalJs(`(() => ({ path: location.pathname + location.search, sel: document.querySelector('.ct-picker .ct-figure.is-current') ? document.querySelector('.ct-picker .ct-figure.is-current').textContent : null }))()`);
  check("next link 2 opens chat with zhuyuanzhang", c1.path.endsWith("chat.html?figure=zhuyuanzhang") && /朱元璋/.test(c1.sel || ""), JSON.stringify(c1));
  await nav("http://127.0.0.1:4173/chapter.html");
  await evalJs(`document.querySelectorAll('.ch-next-link')[2].click()`);
  await sleep(1200);
  const t1 = await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1380"]'); return { path: location.pathname + location.search, hit: a.classList.contains('is-deep-hit'), open: a.classList.contains('is-open') }; })()`);
  check("next link 3 opens timeline e1380 expanded+highlighted", t1.path.endsWith("timeline.html?event=e1380") && t1.hit && t1.open, JSON.stringify(t1));

  // cards link
  await nav("http://127.0.0.1:4173/cards.html");
  const banner = await evalJs(`(() => { const a = document.querySelector('.cw-chapter-banner'); if (!a) return null; const m = a.querySelector('.cw-banner-main'); const wrap = document.querySelector('.cw-wrap'); const group = document.querySelector('.cw-group'); return { href: m.getAttribute('href'), eyebrow: a.querySelector('.cw-banner-eyebrow').textContent, title: a.querySelector('.cw-banner-title').textContent, desc: a.querySelector('.cw-banner-desc').textContent, btn: a.querySelector('.cw-banner-btn').textContent, aboveGrid: !!(a.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING), inWrap: wrap.contains(a) }; })()`);
  check("cards banner verbatim above person grid", banner && banner.href === "chapter.html" && banner.eyebrow === "白话明史 · 试点章" && banner.title === "洪武朝" && banner.desc === "用白话把洪武朝从头讲一遍：建国、废相、锦衣卫与晚年大狱，全文依据本站已核材料。" && banner.btn === "开始读 →" && banner.aboveGrid && banner.inWrap, JSON.stringify(banner));
  const oldLinks = await evalJs(`document.querySelectorAll('.cw-chapter-link').length`);
  check("old in-card link removed", oldLinks === 0, oldLinks);
  const bannerTarget = await evalJs(`document.querySelector('.cw-banner-main').target`);
  check("banner targets chapter in a new tab", bannerTarget === "_blank", bannerTarget);
  await nav("http://127.0.0.1:4173/cards.html");
  await shot("cards-banner-desktop");

  // profile unchanged across a chapter visit
  const pfCount = () => evalJs(`(() => { const stat = [...document.querySelectorAll('.pf-stat')].find(s => s.querySelector('.pf-stat-title').textContent === SITE_DATA.profileUI.modulesTitle); return stat.querySelector('.pf-count').textContent; })()`);
  await nav("http://127.0.0.1:4173/profile.html");
  const pfBefore = await pfCount();
  const lsBefore = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav("http://127.0.0.1:4173/chapter.html");
  await evalJs(`window.scrollTo(0, document.body.scrollHeight)`);
  await sleep(400);
  const lsAfterChapter = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav("http://127.0.0.1:4173/profile.html");
  const pfAfter = await pfCount();
  check("profile + progress identical before/after chapter visit", pfBefore === pfAfter && /\/ 6$/.test(pfAfter) && lsBefore === lsAfterChapter, JSON.stringify([pfBefore, pfAfter]));

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/chapter.html");
  const mob = await evalJs(`(() => ({ docW: document.documentElement.scrollWidth, readW: Math.round(document.querySelector('.ch-read').getBoundingClientRect().width), secs: document.querySelectorAll('.ch-section').length }))()`);
  check("mobile chapter: no overflow, 5 sections", mob.docW <= 375 && mob.readW <= 335 && mob.secs === 5, JSON.stringify(mob));
  await shot("chapter-mobile");
  await nav("http://127.0.0.1:4173/index.html");
  const mobIdx = await evalJs(`document.documentElement.scrollWidth`);
  check("mobile index with entry: no overflow", mobIdx <= 375, mobIdx);
  await nav("http://127.0.0.1:4173/cards.html");
  const mobBanner = await evalJs(`(() => { const a = document.querySelector('.cw-chapter-banner'); const r = a.getBoundingClientRect(); const b = a.querySelector('.cw-banner-btn').getBoundingClientRect(); const c = a.querySelector('.cw-banner-copy').getBoundingClientRect(); return { docW: document.documentElement.scrollWidth, right: Math.round(r.right), stacked: b.top >= c.bottom - 1, btnInside: b.right <= r.right + 1 && b.left >= r.left - 1 }; })()`);
  check("390px banner: no overflow, stacked, button inside", mobBanner.docW <= 390 && mobBanner.right <= 390 && mobBanner.stacked && mobBanner.btnInside, JSON.stringify(mobBanner));
  await shot("cards-banner-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });