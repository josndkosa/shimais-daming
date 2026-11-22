const { spawn, execSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9267;
const ROOT = "D:/shimais-daming";
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud29`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const shot = async (name, beyond) => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!beyond }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };

const BOOKS = [
  ["《明朝那些事儿》", "当年明月", "入门", "用现代人的语感把明朝 276 年从头讲到尾，最好读的一套。适合先建立全程脉络，知道每件事的前因后果再回头查细节。微信读书、各大书店有正版。提醒一句：它是通俗历史叙事，不是史料本身——读它入门，查证还要靠下面的书。"],
  ["《万历十五年》", "黄仁宇", "入门", "薄薄一本，从万历十五年这平常的一年切进去，讲透整个王朝的制度困局。适合查万历朝的人和事：张居正、申时行、海瑞为什么都困在体制里出不来——和本站的制度视角最贴。微信读书、图书馆、各大书店可读。"],
  ["《明史》", "（清）张廷玉等撰 · 中华书局点校本", "原文", "二十四史之一，本站每张史料卡标注的出处就是它。适合按人查：本纪查皇帝，列传查人物，志查制度；文言，但条目清楚，带着名字去查不难。中国哲学书电子化计划（ctext.org）可全文检索，图书馆有点校本纸书。"],
  ["《明实录》", "明代官修", "原文", "每位皇帝一部的编年实录，按年月逐日排，是离事件最近的官方记录。适合查『某年某月到底发生了什么』，门槛最高，带着具体问题去翻最划算。ctext 等古籍数据库有收录，大型图书馆有影印本。"],
  ["《明史讲义》", "孟森", "进阶", "孟森在北大的讲义，篇幅不大，把明朝的制度与大事件讲得干净清楚。适合系统补课：政治制度怎么运转、大案的来龙去脉，是学术入门的正路。微信读书、图书馆可读。"],
  ["《万历野获编》", "沈德符", "趣味原文", "万历朝人自己的笔记，宫廷、社会、官场的见闻，短篇为主，文言也不难啃。适合查『当时人怎么说』：一条鞭、矿税、宫里宫外的日常细节。ctext 等古籍库可查，微信读书有点校本。"],
  ["《南明史》", "顾诚", "进阶", "本站时间线止于崇祯十七年，这本书接着往下讲 1644 之后的南明。适合查崇祯之后：弘光、隆武、永历诸朝与抗清的始末。图书馆、各大书店可读。"],
];
const readBooks = () => evalJs(`(() => {
  const sec = document.querySelector('.sr-books');
  if (!sec) return null;
  return {
    title: sec.querySelector('.section-title').textContent,
    hint: sec.querySelector('.section-hint').textContent,
    items: [...sec.querySelectorAll('.sr-book')].map(b => ({
      title: b.querySelector('.sr-book-title').textContent,
      author: b.querySelector('.sr-book-author').textContent,
      level: b.querySelector('.sr-book-level').textContent,
      note: b.querySelector('.sr-book-note').textContent,
      links: [...b.querySelectorAll('a')].map(a => ({ text: a.textContent, href: a.href, target: a.target, rel: a.rel }))
    })),
    visible: !!sec.offsetParent
  };
})()`);

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

  await nav("http://127.0.0.1:4173/search.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/search.html");
  const b0 = await readBooks();
  const verbatim = b0 && b0.items.length === 7 && b0.items.every((it, i) => it.title === BOOKS[i][0] && it.author === BOOKS[i][1] && it.level === BOOKS[i][2] && it.note === BOOKS[i][3]);
  check("7 books on load, order/title/author/level/note verbatim", verbatim && b0.visible, JSON.stringify(b0 && b0.items.map((x) => [x.title, x.level])));
  check("section title + hint verbatim", b0.title === "想读原文？这几本书" && b0.hint === "本站的检索只到站内为止。想核对原文、往深里查，照这份书单去找——都是真能读下去的书。", JSON.stringify([b0.title, b0.hint]));
  const links = b0.items.flatMap((x) => x.links);
  check("exactly one ctext.org link, new tab, in 明史 note", links.length === 1 && links[0].text === "ctext.org" && links[0].href === "https://ctext.org/" && links[0].target === "_blank" && /noopener/.test(links[0].rel) && b0.items[2].links.length === 1, JSON.stringify(links));
  const pos0 = await evalJs(`(() => { const r = document.querySelector('.sr-results'); const b = document.querySelector('.sr-books'); return !!(r.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); })()`);
  check("books below results container on load", pos0, pos0);
  await shot("search-books-load", true);

  await evalJs(`(() => { const i = document.querySelector('.sr-input'); i.value = '土木堡'; document.querySelector('.sr-form').dispatchEvent(new Event('submit', { cancelable: true })); })()`);
  await sleep(200);
  const after = await evalJs(`(() => { const r = document.querySelector('.sr-results'); const b = document.querySelector('.sr-books'); return { cards: r.querySelectorAll('.sr-card').length, status: document.querySelector('.sr-status').textContent, below: !!(r.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), visible: !!b.offsetParent, count: b.querySelectorAll('.sr-book').length }; })()`);
  check("after search: results present, books still below and visible", after.cards === 3 && after.status === "找到 3 条" && after.below && after.visible && after.count === 7, JSON.stringify(after));
  await shot("search-books-after");
  const ls = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  const fc = await evalJs(`window.__fetchCount`);
  check("no progress writes, zero fetch", ls === null && fc === 0, JSON.stringify([ls, fc]));

  // empty + no-result states keep books
  await evalJs(`(() => { const i = document.querySelector('.sr-input'); i.value = '明史全文'; document.querySelector('.sr-form').dispatchEvent(new Event('submit', { cancelable: true })); })()`);
  const nr = await evalJs(`document.querySelectorAll('.sr-books .sr-book').length`);
  check("no-result state keeps books", nr === 7, nr);

  // red lines
  const D = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SITE_DATA", {});
  const IDX = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SEARCH_INDEX", {});
  const HEADIDX = vm.runInNewContext(execSync("git show HEAD:frontend/data.js", { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString() + "\n;SEARCH_INDEX", {});
  const HEAD = vm.runInNewContext(execSync("git show HEAD:frontend/data.js", { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString() + "\n;SITE_DATA", {});
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check("SEARCH_INDEX first 99 identical to HEAD, total 107", same(IDX.slice(0, 99), HEADIDX) && IDX.length === 107, IDX.length);
  check("qinli/relations/modules/cards untouched", same(D.qinli, HEAD.qinli) && same(D.relations, HEAD.relations) && same(D.modules, HEAD.modules) && same(D.cards, HEAD.cards), "diff");
  const appSrc = fs.readFileSync(ROOT + "/frontend/app.js", "utf8");
  check("CHAT_API_BASE untouched", /const CHAT_API_BASE = "http:\/\/localhost:8000";/.test(appSrc), "changed");
  const navN = await evalJs(`document.querySelectorAll('.nav-link').length`);
  check("nav still 10", navN === 10, navN);
  let leak = false;
  for (const p of ["index.html", "timeline.html", "cards.html", "chat.html", "quiz.html", "profile.html", "qinli.html", "relations.html", "decisions.html"]) {
    await nav("http://127.0.0.1:4173/" + p);
    if (await evalJs(`!!document.querySelector('.sr-books')`)) leak = true;
  }
  check("books only on search page", !leak, "leak");

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/search.html");
  const mob = await evalJs(`(() => { const b = document.querySelector('.sr-books'); const meta = [...b.querySelectorAll('.sr-book-meta')]; return { docW: document.documentElement.scrollWidth, books: b.querySelectorAll('.sr-book').length, metaOverflow: meta.some(m => m.scrollWidth > m.clientWidth + 1) }; })()`);
  check("mobile: no overflow, 7 books, meta wraps", mob.docW <= 375 && mob.books === 7 && !mob.metaOverflow, JSON.stringify(mob));
  await evalJs(`document.querySelector('.sr-books').scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(300);
  await shot("search-books-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });