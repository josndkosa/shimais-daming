const { spawn, execSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9262;
const ROOT = "D:/shimais-daming";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud24`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };

const D = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SITE_DATA", {});
const IDX = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SEARCH_INDEX", {});
const HEAD = vm.runInNewContext(execSync("git show HEAD:frontend/data.js", { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString() + "\n;SITE_DATA", {});
const tierOf = (e, q) =>
  e.title.includes(q) || (e.year && e.year.includes(q)) ? 0 : e.keywords.some((k) => k.includes(q) || q.includes(k)) ? 1 : e.text.includes(q) ? 2 : -1;
const expectHits = (q) => IDX.map((e, i) => ({ e, i, t: tierOf(e, q) })).filter((x) => x.t >= 0).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => ({ href: x.e.target, title: x.e.title }));
const WORDS = ["土木堡", "批红", "煤山", "海瑞骂皇帝", "一条鞭法", "首辅", "郑和", "两袖清风", "夺情", "三饷", "靖难", "刘瑾", "王阳明", "萨尔浒", "大礼议", "1449", "1581", "1644", "于谦", "张居正"];
const NAV_ORDER = ["首页", "时间线", "帝王首辅", "决策模式", "亲历", "人物与制度卡", "史料检索", "人物对话", "小测", "研读画像"];

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
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__fetchCount = 0; const of = window.fetch; window.fetch = function (...a) { window.__fetchCount++; return of.apply(this, a); };" });

  // ---- index integrity (node side) ----
  const counts = IDX.reduce((o, e) => ((o[e.kind] = (o[e.kind] || 0) + 1), o), {});
  check("index exactly 107 = 48+23+36", IDX.length === 107 && counts.source === 48 && counts.timeline === 23 && counts.relation === 36, JSON.stringify(counts));
  let verbOk = true; const verbBad = [];
  for (const e of IDX) {
    if (e.kind === "source") {
      const fig = e.target.split("figure=")[1];
      const c = JSON.parse(fs.readFileSync(ROOT + "/backend/data/" + fig + ".json", "utf8")).chunks.find((x) => x.id === e.id);
      if (!c || c.title !== e.title || c.text !== e.text || c.source !== e.source) { verbOk = false; verbBad.push(fig + e.id); }
    } else if (e.kind === "timeline") {
      const ev = D.timeline.events.find((x) => x.id === e.id);
      if (!ev || ev.title !== e.title || ev.summary + ev.detail[0] !== e.text || ev.year !== e.year || e.source !== "本站时间线" || e.target !== "timeline.html?event=" + e.id) { verbOk = false; verbBad.push(e.id); }
    } else {
      const p = D.relations.chiefs.concat(D.relations.guests).find((x) => x.name === e.id);
      const kind = D.relations.chiefs.includes(p) ? "chief" : "guest";
      if (!p || !e.text.includes(p.note) || !e.text.includes(p.tag) || !e.text.includes(p.end) || e.lord !== p.lord || e.source !== "本站帝王首辅表" || e.target !== "relations.html?person=" + p.name + "&kind=" + kind) { verbOk = false; verbBad.push(e.id); }
    }
    if (!Array.isArray(e.keywords) || !e.keywords.length || !e.target) { verbOk = false; verbBad.push("fields:" + e.id); }
  }
  check("all 99 titles/texts/sources verbatim + targets per spec", verbOk, JSON.stringify(verbBad));
  const excluded = IDX.some((e) => e.kind === "relation" && D.relations.emperors.some((x) => x.name === e.id && !D.relations.chiefs.some((c) => c.name === e.id) && !D.relations.guests.some((g) => g.name === e.id)));
  check("no emperor lanes / cards / qinli in index", !excluded && !IDX.some((e) => /qinli|cards\.html|quiz|profile/.test(e.target)), "leak");

  // ---- search page ----
  await nav("http://127.0.0.1:4173/search.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/search.html");
  const navNow = await evalJs(`[...document.querySelectorAll('.nav-link .nav-full')].map(x => x.textContent)`);
  check("nav 10 items exact order", JSON.stringify(navNow) === JSON.stringify(NAV_ORDER), JSON.stringify(navNow));
  const navH1280 = await evalJs(`(() => { const n = document.querySelector('.site-nav'); const tops = [...document.querySelectorAll('.nav-link')].map(a => a.offsetTop); return { h: n.offsetHeight, oneRow: new Set(tops).size === 1, linksScroll: document.querySelector('.nav-links').scrollWidth > document.querySelector('.nav-links').clientWidth }; })()`);
  check("1280 nav single row, no scroll needed", navH1280.h <= 60 && navH1280.oneRow && !navH1280.linksScroll, JSON.stringify(navH1280));

  const empty = await evalJs(`(() => ({ status: document.querySelector('.sr-status').textContent, hot: [...document.querySelectorAll('.sr-hot-word')].map(b => b.textContent), cards: document.querySelectorAll('.sr-card').length, placeholder: document.querySelector('.sr-input').placeholder }))()`);
  check("empty query: hint + 8 hot words, no results", empty.cards === 0 && empty.hot.length === 8 && empty.status === D.searchUI.emptyHint && empty.placeholder === "搜人名、事件、制度……比如：土木堡、批红、一条鞭法", JSON.stringify(empty));

  const doSearch = (w) => evalJs(`(() => { const i = document.querySelector('.sr-input'); i.value = ${JSON.stringify(w)}; document.querySelector('.sr-form').dispatchEvent(new Event('submit', { cancelable: true })); return { status: document.querySelector('.sr-status').textContent, cards: [...document.querySelectorAll('.sr-card')].map(c => ({ href: c.getAttribute('href'), title: c.querySelector('.sr-title').textContent })) }; })()`);
  let wordsOk = true; const wordBad = [];
  for (const w of WORDS) {
    const got = await doSearch(w);
    const want = expectHits(w);
    if (!want.length || got.cards.length !== want.length || JSON.stringify(got.cards) !== JSON.stringify(want) || got.status !== "找到 " + want.length + " 条") { wordsOk = false; wordBad.push([w, got.cards.length, want.length]); }
  }
  check("20 real queries non-zero, tier order title>keyword>text, count line", wordsOk, JSON.stringify(wordBad));

  const trim = await doSearch("  土木堡  ");
  const plain = await doSearch("土木堡");
  check("query trimmed", JSON.stringify(trim) === JSON.stringify(plain), JSON.stringify([trim.cards.length, plain.cards.length]));

  const hit = await evalJs(`(() => { const h = document.querySelector('.sr-card .sr-hit'); return h ? { text: h.textContent, color: getComputedStyle(h).color, weight: getComputedStyle(h).fontWeight } : null; })()`);
  check("hit word bold vermilion in summary", hit && hit.text === "土木堡" && hit.weight === "700" && hit.color !== "rgb(232, 232, 230)", JSON.stringify(hit));

  const srcLines = await evalJs(`(() => { const o = {}; document.querySelectorAll('.sr-card').forEach(c => { const k = c.querySelector('.sr-kind').textContent; if (!o[k]) o[k] = c.querySelector('.sr-source').textContent; }); return o; })()`);
  check("source lines: 明史 / 本站时间线·year / 本站帝王首辅表·lord", /^《明史/.test(srcLines["史料"] || "") && /^本站时间线 · \d{4}$/.test(srcLines["时间线"] || "") && /^本站帝王首辅表 · .+$/.test(srcLines["关系表"] || ""), JSON.stringify(srcLines));
  await shot("search-tumubu");

  const noRes = await doSearch("明史全文");
  const noResState = await evalJs(`(() => ({ status: document.querySelector('.sr-status').textContent, hotInResults: document.querySelectorAll('.sr-results .sr-hot-word').length, hint: document.querySelector('.sr-empty-hint') ? document.querySelector('.sr-empty-hint').textContent : null }))()`);
  check("no-result state: prompt + hot words + hint, not blank", noRes.cards.length === 0 && noResState.status === "没有找到相关内容，试试这些词：" && noResState.hotInResults === 8 && noResState.hint === "本站只收录已核订的 99 条内容，全文检索不在本站范围", JSON.stringify(noResState));

  const hotClick = await evalJs(`(() => { [...document.querySelectorAll('.sr-hot-word')].find(b => b.textContent === '煤山').click(); return document.querySelector('.sr-status').textContent; })()`);
  check("hot word click searches", hotClick.startsWith("找到 ") && !hotClick.includes(" 0 "), hotClick);

  const lsAfter = await evalJs(`localStorage.getItem('shimais-daming:progress:v1')`);
  const fetchCount = await evalJs(`window.__fetchCount`);
  check("search writes no progress, zero fetch calls", lsAfter === null && fetchCount === 0, JSON.stringify([lsAfter, fetchCount]));

  // ---- deep links ----
  await nav("http://127.0.0.1:4173/timeline.html?event=e1449");
  const tlDeep = await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1449"]'); const r = a.getBoundingClientRect(); return { open: a.classList.contains('is-open'), detailHidden: a.querySelector('.tl-detail').hidden, hit: a.classList.contains('is-deep-hit'), inView: r.top > 0 && r.top < innerHeight, expanded: a.querySelector('.tl-row').getAttribute('aria-expanded') }; })()`);
  check("timeline ?event= expands + highlights + scrolls into view", tlDeep.open && !tlDeep.detailHidden && tlDeep.hit && tlDeep.inView && tlDeep.expanded === "true", JSON.stringify(tlDeep));
  await shot("timeline-deep-e1449");
  await nav("http://127.0.0.1:4173/timeline.html?event=bogus");
  const tlBogus = await evalJs(`document.querySelectorAll('.tl-event.is-deep-hit').length`);
  check("timeline bogus param harmless", tlBogus === 0, tlBogus);

  await nav("http://127.0.0.1:4173/relations.html?person=" + encodeURIComponent("解缙") + "&kind=chief");
  const rlDeep = await evalJs(`(() => { const o = document.querySelector('.rl-overlay'); return { open: !o.hidden, name: o.querySelector('.rl-card-name') ? o.querySelector('.rl-card-name').textContent : null, rows: [...o.querySelectorAll('.rl-card-row')].map(r => r.textContent) }; })()`);
  check("relations ?person&kind opens same small card", rlDeep.open && rlDeep.name === "解缙" && rlDeep.rows.some((r) => r.includes("1402–1407")), JSON.stringify(rlDeep));
  await shot("relations-deep-xiejin");
  await nav("http://127.0.0.1:4173/relations.html?person=" + encodeURIComponent("于谦") + "&kind=guest");
  const rlGuest = await evalJs(`(() => { const o = document.querySelector('.rl-overlay'); return { open: !o.hidden, name: o.querySelector('.rl-card-name').textContent }; })()`);
  check("relations guest deep link", rlGuest.open && rlGuest.name === "于谦", JSON.stringify(rlGuest));
  await nav("http://127.0.0.1:4173/relations.html?person=" + encodeURIComponent("解缙"));
  const rlNoKind = await evalJs(`(() => { const o = document.querySelector('.rl-overlay'); return { open: !o.hidden, name: o.querySelector('.rl-card-name').textContent }; })()`);
  check("relations person without kind falls back chief", rlNoKind.open && rlNoKind.name === "解缙", JSON.stringify(rlNoKind));
  await nav("http://127.0.0.1:4173/relations.html?person=" + encodeURIComponent("不存在") + "&kind=chief");
  const rlBogus = await evalJs(`document.querySelector('.rl-overlay').hidden`);
  check("relations bogus person lands on page, no overlay/error", rlBogus === true, rlBogus);

  // result card click-through (three kinds)
  await nav("http://127.0.0.1:4173/search.html");
  const targets = await evalJs(`(() => { const i = document.querySelector('.sr-input'); i.value = '土木堡'; document.querySelector('.sr-form').dispatchEvent(new Event('submit', { cancelable: true })); return [...document.querySelectorAll('.sr-card')].slice(0, 6).map(c => ({ kind: c.querySelector('.sr-kind').textContent, href: c.getAttribute('href') })); })()`);
  const srcT = targets.find((x) => x.kind === "史料"), tlT = targets.find((x) => x.kind === "时间线"), rlT = targets.find((x) => x.kind === "关系表");
  await nav("http://127.0.0.1:4173/" + srcT.href);
  const chatSel = await evalJs(`(() => { const b = document.querySelector('.ct-picker .ct-figure.is-selected, .ct-picker .ct-figure[aria-pressed="true"]'); return b ? b.textContent : document.querySelector('.ct-picker') ? document.querySelector('.ct-picker').textContent.slice(0, 80) : null; })()`);
  check("source card lands chat with figure preselected", /于谦/.test(chatSel || ""), JSON.stringify([srcT, chatSel]));
  await nav("http://127.0.0.1:4173/" + tlT.href);
  const tlClick = await evalJs(`(() => { const a = document.querySelector('.tl-event.is-deep-hit'); return a ? a.dataset.id : null; })()`);
  check("timeline card lands expanded event", tlClick === tlT.href.split("event=")[1], JSON.stringify([tlT, tlClick]));
  await nav("http://127.0.0.1:4173/" + rlT.href);
  const rlClick = await evalJs(`(() => { const o = document.querySelector('.rl-overlay'); return !o.hidden ? o.querySelector('.rl-card-name').textContent : null; })()`);
  check("relation card lands small card", !!rlClick, JSON.stringify([rlT, rlClick]));

  // ---- red lines ----
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check("qinli / quiz data / modules length untouched (card quotes excepted)", same(HEAD.qinli, D.qinli) && same(HEAD.quiz, D.quiz) && D.modules.length === 6 && same(HEAD.timeline, D.timeline) && same(HEAD.relations, D.relations) && same(HEAD.cards, D.cards.map((c) => { const o = Object.assign({}, c); delete o.quote; delete o.quoteFrom; return o; })), "diff");
  const apiBase = fs.readFileSync(ROOT + "/frontend/app.js", "utf8").match(/const CHAT_API_BASE = "([^"]+)"/)[1];
  check("CHAT_API_BASE still localhost:8000", apiBase === "http://localhost:8000", apiBase);
  await nav("http://127.0.0.1:4173/profile.html");
  const pf = await evalJs(`(() => { const stat = [...document.querySelectorAll('.pf-stat')].find(s => s.querySelector('.pf-stat-title').textContent === '模块进度'); const head = document.querySelector('.head-title').textContent; const navTitle = [...document.querySelectorAll('.nav-link .nav-full')].map(x => x.textContent).pop(); return { count: stat.querySelector('.pf-count').textContent, head, navTitle }; })()`);
  check("profile head/nav shortened, stat denominator 6", pf.head === "研读画像" && pf.navTitle === "研读画像" && /\/ 6$/.test(pf.count), JSON.stringify(pf));

  // ---- mobile ----
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/search.html");
  await doSearch("一条鞭法");
  const mob = await evalJs(`(() => { const n = document.querySelector('.site-nav'); const tops = [...document.querySelectorAll('.nav-link')].map(a => a.offsetTop); const nl = document.querySelector('.nav-links'); return { docW: document.documentElement.scrollWidth, navH: n.offsetHeight, oneRow: new Set(tops).size === 1, scrollable: nl.scrollWidth > nl.clientWidth, inputSize: getComputedStyle(document.querySelector('.sr-input')).fontSize }; })()`);
  check("mobile: nav single row scrollable, page no h-overflow, input 16px", mob.docW <= 375 && mob.navH <= 60 && mob.oneRow && mob.scrollable && mob.inputSize === "16px", JSON.stringify(mob));
  await shot("search-mobile");
  await nav("http://127.0.0.1:4173/index.html");
  const mobNavIdx = await evalJs(`(() => { const n = document.querySelector('.site-nav'); return { h: n.offsetHeight, docW: document.documentElement.scrollWidth }; })()`);
  check("mobile index nav single row too", mobNavIdx.h <= 60 && mobNavIdx.docW <= 375, JSON.stringify(mobNavIdx));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });