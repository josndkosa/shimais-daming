const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9310;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const ch8 = JSON.parse(fs.readFileSync(DIR + "/chapter8.json", "utf8"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud66`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0, mainId; const pending = new Map(); const excs = []; const errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1800); };
const pages = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((x) => x.type === "page");
async function trustedClick(selector) {
  await evalJs(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center", behavior: "instant" }); true`);
  await sleep(300);
  const p = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
}
async function expectNewTab(name, urlPrefix) {
  let tab = null;
  for (let i = 0; i < 12; i++) { await sleep(300); tab = (await pages()).find((x) => x.id !== mainId && x.url.startsWith(urlPrefix)); if (tab) break; }
  check(name, !!tab, JSON.stringify((await pages()).map((x) => x.url)));
  if (tab) await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
  await sleep(300);
}
const snap = () => evalJs(`(() => ({
  head: document.querySelector('.head-title').textContent,
  tabs: [...document.querySelectorAll('.ch-tab')].map(t => ({ text: t.textContent, current: t.getAttribute('aria-current') === 'page' })),
  intro: document.querySelector('.ch-intro').textContent,
  secs: [...document.querySelectorAll('.ch-section')].map(s => ({ title: s.querySelector('.ch-sec-title').textContent, ps: [...s.querySelectorAll('.ch-p')].map(p => p.textContent), quotes: [...s.querySelectorAll('.cw-paper-quote')].map(q => q.textContent), source: s.querySelector('.ch-source').textContent, slips: s.querySelectorAll('details.ch-sources').length })),
  chapterNav: [...document.querySelectorAll('.ch-chapter-link')].map(a => ({ text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target') })),
  next: [...document.querySelectorAll('.ch-next-link')].map(a => ({ label: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
  body: document.querySelector('.ch-read').textContent
}))()`);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  mainId = t.id;
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") excs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push(d.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 200));
  };
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(600);

  // 1) finale verbatim
  await nav(BASE + "/chapter.html?ch=xuxiake");
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ sentinel: "bg" })); true`);
  const before = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav(BASE + "/chapter.html?ch=xuxiake");
  let s = await snap();
  check("finale head + eight tabs, last current, label 终章", s.head === "白话明史 · 徐霞客" && s.tabs.length === 8 && JSON.stringify(s.tabs.map(x => x.current)) === JSON.stringify([false, false, false, false, false, false, false, true]) && s.tabs[7].text === "终章 · 徐霞客", JSON.stringify({ head: s.head, cur: s.tabs.map(x => x.current), last: s.tabs[7] && s.tabs[7].text }));
  const prefix = await evalJs("SITE_DATA.chapterUI.sourcePrefix");
  const paras = s.secs.reduce((n, x) => n + x.ps.length, 0);
  const quoteCount = s.secs.reduce((n, x) => n + x.quotes.length, 0);
  const verbatim = s.intro === ch8.intro && s.secs.length === 5 && s.secs.every((sec, i) => {
    const want = ch8.sections[i];
    const wantPlain = want.paragraphs.filter(p => !/^“[^”]*”$/.test(p.trim()));
    const wantQuotes = want.paragraphs.filter(p => /^“[^”]*”$/.test(p.trim()));
    return sec.title === want.title && JSON.stringify(sec.ps) === JSON.stringify(wantPlain) &&
      JSON.stringify(sec.quotes) === JSON.stringify(wantQuotes) && sec.source === prefix + want.sourceNote && sec.slips === 0;
  }) && paras + quoteCount === 18;
  check("finale: 5 sections 18 paragraphs verbatim, quote paragraph in paper block", verbatim, JSON.stringify({ paras, quoteCount }));
  check("quote text verbatim (钱谦益传临终自述)", s.secs[4].quotes[0] === ch8.sections[4].paragraphs[3], String(s.secs[4].quotes[0]).slice(0, 40));
  check("forbidden quotes absent", ["大丈夫当朝游碧海而暮宿苍梧", "五岳归来不看山，黄山归来不看岳"].every(w => !s.body.includes(w)), "found");
  check("province count vague, no specific number", s.body.includes("十余省") && !/十[一二三四五六七八九]省/.test(s.body), "bad");
  check("finale nav: 上一章 only", JSON.stringify(s.chapterNav) === JSON.stringify([{ text: "← 上一章：崇祯", href: "chapter.html?ch=chongzhen", target: null }]), JSON.stringify(s.chapterNav));
  check("finale nextSteps exact + AP on qinli only", JSON.stringify(s.next) === JSON.stringify(ch8.nextSteps.map((l, i) => ({ label: l.label, href: l.href, target: i === 2 ? "_blank" : null, rel: i === 2 ? "noopener" : null }))), JSON.stringify(s.next));
  const midStore = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  check("finale visit writes no progress", midStore === before, JSON.stringify({ before, midStore }));

  // 2) nextSteps reachable
  await trustedClick('.ch-next-link[href="qinli-play.html?story=q1644"]');
  await expectNewTab("亲历《煤山前夜》 opens q1644 play new tab", BASE + "/qinli-play.html?story=q1644");
  await nav(BASE + "/chapter.html?ch=xuxiake");
  await trustedClick('.ch-next-link[href="relations.html"]');
  await sleep(1600);
  const rel = await evalJs(`(() => { const rows = [...document.querySelectorAll('.rl-lane-guest .rl-row')]; const last = rows[rows.length - 1]; return { path: location.pathname, guests: rows.length, lastName: last ? last.querySelector('.rl-person').textContent : null, lastFull: last && last.querySelector('.rl-person-full') ? last.querySelector('.rl-person-full').textContent : null }; })()`);
  check("relations step lands table with 徐霞客 last", rel.path.endsWith("/relations.html") && rel.guests === 16 && rel.lastName === "徐霞客", JSON.stringify(rel));
  await nav(BASE + "/chapter.html?ch=xuxiake");
  await trustedClick('.ch-next-link[href="timeline.html?event=e1644"]');
  await sleep(1600);
  const tl = await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1644"]'); return { path: location.pathname + location.search, hit: a ? a.classList.contains('is-deep-hit') : false, open: a ? a.classList.contains('is-open') : false }; })()`);
  check("e1644 nextStep lands expanded timeline event", tl.path.endsWith("timeline.html?event=e1644") && tl.hit && tl.open, JSON.stringify(tl));

  // 3) chapter seven next nav points to finale
  await nav(BASE + "/chapter.html?ch=chongzhen");
  s = await snap();
  check("chapter seven nav now includes finale", JSON.stringify(s.chapterNav) === JSON.stringify([
    { text: "← 上一章：万历怠政", href: "chapter.html?ch=wanli", target: null },
    { text: "下一章：徐霞客 →", href: "chapter.html?ch=xuxiake", target: null },
  ]), JSON.stringify(s.chapterNav));
  const bp = (await pages()).length;
  await trustedClick('.ch-chapter-link[href="chapter.html?ch=xuxiake"]');
  await sleep(1600);
  check("下一章 nav switches same-tab to finale", (await evalJs("location.search")) === "?ch=xuxiake" && (await pages()).length === bp, await evalJs("location.search"));

  // 4) unknown fallback
  await nav(BASE + "/chapter.html?ch=nope");
  s = await snap();
  check("unknown ch falls back to chapter one", s.head === "白话明史 · 洪武朝" && s.tabs[0].current === true, JSON.stringify(s.head));

  // 5) index/cards finale link
  await nav(BASE + "/index.html");
  const idx = await evalJs(`(() => { const as = [...document.querySelectorAll('.ch-entry-second')]; const a = as[as.length - 1]; return { count: as.length, text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }; })()`);
  check("index finale link verbatim + new tab", idx.count === 7 && idx.text === "终章 · 徐霞客 →" && idx.href === "chapter.html?ch=xuxiake" && idx.target === "_blank" && idx.rel === "noopener", JSON.stringify(idx));
  await trustedClick('.ch-entry-second[href="chapter.html?ch=xuxiake"]');
  await expectNewTab("index finale link opens finale new tab", BASE + "/chapter.html?ch=xuxiake");
  await nav(BASE + "/cards.html");
  const cw = await evalJs(`(() => { const as = [...document.querySelectorAll('.cw-banner-links .cw-banner-second')]; const a = as[as.length - 1]; return { count: as.length, text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), inside: !!a.closest('.cw-chapter-banner') }; })()`);
  check("cards banner finale link inside banner + new tab", cw.count === 7 && cw.text === "终章 · 徐霞客 →" && cw.href === "chapter.html?ch=xuxiake" && cw.target === "_blank" && cw.inside, JSON.stringify(cw));
  await trustedClick('.cw-banner-second[href="chapter.html?ch=xuxiake"]');
  await expectNewTab("cards finale link opens finale new tab", BASE + "/chapter.html?ch=xuxiake");

  // 6) 390px: eight links wrap, no overflow
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/cards.html");
  const mob = await evalJs(`(() => { const as = [...document.querySelectorAll('.cw-banner-links .cw-banner-second')]; return { sw: document.documentElement.scrollWidth, links: as.length, rows: new Set(as.map(a => Math.round(a.getBoundingClientRect().top))).size, inside: as.every(a => a.getBoundingClientRect().right <= 390) }; })()`);
  check("390px: seven chapter links wrap inside banner, no overflow", mob.sw <= 390 && mob.links === 7 && mob.rows > 1 && mob.inside, JSON.stringify(mob));
  await nav(BASE + "/chapter.html?ch=xuxiake");
  const mob2 = await evalJs(`(() => ({ sw: document.documentElement.scrollWidth, tabs: document.querySelectorAll('.ch-tab').length, secs: document.querySelectorAll('.ch-section').length, quote: document.querySelectorAll('.cw-paper-quote').length }))()`);
  check("390px finale: no overflow, 8 tabs, 5 sections, quote block", mob2.sw <= 390 && mob2.tabs === 8 && mob2.secs === 5 && mob2.quote === 1, JSON.stringify(mob2));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify47 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });