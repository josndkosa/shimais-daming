const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9308;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const ch6 = JSON.parse(fs.readFileSync(DIR + "/chapter6.json", "utf8"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud64`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
  secs: [...document.querySelectorAll('.ch-section')].map(s => ({ title: s.querySelector('.ch-sec-title').textContent, ps: [...s.querySelectorAll('.ch-p')].map(p => p.textContent), source: s.querySelector('.ch-source').textContent, slips: s.querySelectorAll('details.ch-sources').length })),
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

  // 1) chapter six verbatim
  await nav(BASE + "/chapter.html?ch=wanli");
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ sentinel: "aw" })); true`);
  const before = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav(BASE + "/chapter.html?ch=wanli");
  let s = await snap();
  check("wanli head + eight tabs, sixth current", s.head === "白话明史 · 万历怠政" && s.tabs.length === 8 && JSON.stringify(s.tabs.map(x => x.current)) === JSON.stringify([false, false, false, false, false, true, false, false]) && s.tabs[5].text === "第六章 · 万历怠政", JSON.stringify({ head: s.head, tabs: s.tabs.map(x => x.current) }));
  const prefix = await evalJs("SITE_DATA.chapterUI.sourcePrefix");
  const verbatim = s.intro === ch6.intro && s.secs.length === 6 && s.secs.every((sec, i) =>
    sec.title === ch6.sections[i].title && JSON.stringify(sec.ps) === JSON.stringify(ch6.sections[i].paragraphs) &&
    sec.source === prefix + ch6.sections[i].sourceNote && sec.slips === 0) &&
    s.secs.reduce((n, x) => n + x.ps.length, 0) === 12;
  check("chapter six: 6 sections 12 paragraphs verbatim, no slips", verbatim, JSON.stringify(s.secs.map(x => [x.title, x.ps.length])));
  check("five approved quotes present", ["帝不能自由", "靠个人权威推进的改革，其寿命往往与改革者本人同步", "凭尔几路来，我只一路去", "民变与边患从此互为因果", "支撑了明朝最后六十年的财政——哪怕这数字从一开始就带着水分"].every(q => s.body.includes(q)), "missing");
  check("forbidden topics absent", ["国本之争", "东林党争", "矿税监"].every(w => !s.body.includes(w)), "found");
  check("chapter six nav: 上一章 + 下一章", JSON.stringify(s.chapterNav) === JSON.stringify([{ text: "← 上一章：张居正", href: "chapter.html?ch=zhangjuzheng", target: null }, { text: "下一章：崇祯 →", href: "chapter.html?ch=chongzhen", target: null }]), JSON.stringify(s.chapterNav));
  check("chapter six nextSteps exact + AP", JSON.stringify(s.next) === JSON.stringify(ch6.nextSteps.map((l, i) => ({ label: l.label, href: l.href, target: i === 0 ? "_blank" : null, rel: i === 0 ? "noopener" : null }))), JSON.stringify(s.next));
  const midStore = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  check("chapter six visit writes no progress", midStore === before, JSON.stringify({ before, midStore }));

  // 2) nextSteps reachable: q1644 new tab, e1619 same-tab deep link
  await trustedClick('.ch-next-link[href="qinli-play.html?story=q1644"]');
  await expectNewTab("亲历《煤山前夜》 opens q1644 play new tab", BASE + "/qinli-play.html?story=q1644");
  await trustedClick('.ch-next-link[href="timeline.html?event=e1619"]');
  await sleep(1600);
  const tl = await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1619"]'); return { path: location.pathname + location.search, hit: a ? a.classList.contains('is-deep-hit') : false, open: a ? a.classList.contains('is-open') : false }; })()`);
  check("e1619 nextStep lands expanded timeline event", tl.path.endsWith("timeline.html?event=e1619") && tl.hit && tl.open, JSON.stringify(tl));

  // 3) chapter five next nav points to wanli, same-tab
  await nav(BASE + "/chapter.html?ch=zhangjuzheng");
  s = await snap();
  check("chapter five nav now includes chapter six", JSON.stringify(s.chapterNav) === JSON.stringify([
    { text: "← 上一章：嘉靖与海瑞", href: "chapter.html?ch=jiajing", target: null },
    { text: "下一章：万历怠政 →", href: "chapter.html?ch=wanli", target: null },
  ]), JSON.stringify(s.chapterNav));
  const bp = (await pages()).length;
  await trustedClick('.ch-chapter-link[href="chapter.html?ch=wanli"]');
  await sleep(1600);
  check("下一章 nav switches same-tab to wanli", (await evalJs("location.search")) === "?ch=wanli" && (await pages()).length === bp, await evalJs("location.search"));

  // 4) unknown fallback
  await nav(BASE + "/chapter.html?ch=nope");
  s = await snap();
  check("unknown ch falls back to chapter one", s.head === "白话明史 · 洪武朝" && s.tabs[0].current === true, JSON.stringify(s.head));

  // 5) index/cards sixth link
  await nav(BASE + "/index.html");
  const idx = await evalJs(`(() => { const as = [...document.querySelectorAll('.ch-entry-second')]; const a = as[as.length - 1]; return { count: as.length, text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }; })()`);
  check("index finale link verbatim + new tab", idx.count === 7 && idx.text === "终章 · 徐霞客 →" && idx.href === "chapter.html?ch=xuxiake" && idx.target === "_blank" && idx.rel === "noopener", JSON.stringify(idx));
  await trustedClick('.ch-entry-second[href="chapter.html?ch=wanli"]');
  await expectNewTab("index sixth link opens chapter six new tab", BASE + "/chapter.html?ch=wanli");
  await nav(BASE + "/cards.html");
  const cw = await evalJs(`(() => { const as = [...document.querySelectorAll('.cw-banner-links .cw-banner-second')]; const a = as[as.length - 1]; return { count: as.length, text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), inside: !!a.closest('.cw-chapter-banner') }; })()`);
  check("cards banner finale link inside banner + new tab", cw.count === 7 && cw.text === "终章 · 徐霞客 →" && cw.href === "chapter.html?ch=xuxiake" && cw.target === "_blank" && cw.inside, JSON.stringify(cw));
  await trustedClick('.cw-banner-second[href="chapter.html?ch=wanli"]');
  await expectNewTab("cards sixth link opens chapter six new tab", BASE + "/chapter.html?ch=wanli");

  // 6) 390px
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/chapter.html?ch=wanli");
  const mob = await evalJs(`(() => ({ sw: document.documentElement.scrollWidth, secs: document.querySelectorAll('.ch-section').length, tabs: document.querySelectorAll('.ch-tab').length }))()`);
  check("390px chapter six: no overflow, 6 sections, 8 tabs", mob.sw <= 390 && mob.secs === 6 && mob.tabs === 8, JSON.stringify(mob));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify45 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });