const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9295;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const ch3 = JSON.parse(fs.readFileSync(DIR + "/chapter3.json", "utf8"));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud51`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
  await sleep(350);
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

  // 1) chapter three direct
  await nav(BASE + "/chapter.html?ch=tumubao");
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ sentinel: "ar" })); true`);
  const before = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav(BASE + "/chapter.html?ch=tumubao");
  let s = await snap();
  check("tumubao head + eight tabs, third current", s.head === "白话明史 · 土木堡与北京保卫战" && s.tabs.length === 8 && JSON.stringify(s.tabs.map(x => x.current)) === JSON.stringify([false, false, true, false, false, false, false, false]) && s.tabs[2].text === "第三章 · 土木堡与北京保卫战", JSON.stringify({ head: s.head, tabs: s.tabs }));
  const prefix = await evalJs("SITE_DATA.chapterUI.sourcePrefix");
  const verbatim = s.intro === ch3.intro && s.secs.length === 5 && s.secs.every((sec, i) =>
    sec.title === ch3.sections[i].title && JSON.stringify(sec.ps) === JSON.stringify(ch3.sections[i].paragraphs) &&
    sec.source === prefix + ch3.sections[i].sourceNote && sec.slips === 0);
  check("chapter three verbatim vs spec, no slips", verbatim, JSON.stringify(s.secs.map(x => x.title)));
  check("chapter three key figures", ["1421", "1435", "1449", "二十二万", "十九年", "1450", "1457"].every(n => s.body.includes(n)), "missing");
  check("chapter three has no 石灰吟", !s.body.includes("石灰吟"), "found");
  check("chapter three nav: 上一章 + 下一章", JSON.stringify(s.chapterNav) === JSON.stringify([
    { text: "← 上一章：建文与靖难", href: "chapter.html?ch=jingnan", target: null },
    { text: "下一章：嘉靖与海瑞 →", href: "chapter.html?ch=jiajing", target: null },
  ]), JSON.stringify(s.chapterNav));
  check("chapter three nextSteps exact + AP", JSON.stringify(s.next) === JSON.stringify(ch3.nextSteps.map((l, i) => ({ label: l.label, href: l.href.replace("qinli.html?story=", "qinli-play.html?story="), target: i === 0 ? "_blank" : null, rel: i === 0 ? "noopener" : null }))), JSON.stringify(s.next));
  const midStore = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  check("chapter three visit writes no progress", midStore === before, JSON.stringify({ before, midStore }));

  // 2) qinli step new tab
  await trustedClick('.ch-next-link[href="qinli-play.html?story=q1449"]');
  await expectNewTab("亲历《京师》 opens q1449 new tab", BASE + "/qinli-play.html?story=q1449");
  check("chapter three origin preserved", (await evalJs("location.pathname + location.search")) === "/chapter.html?ch=tumubao", await evalJs("location.pathname + location.search"));

  // 3) chapter two gains next nav, click same-tab
  await nav(BASE + "/chapter.html?ch=jingnan");
  s = await snap();
  check("chapter two nav now includes chapter three", JSON.stringify(s.chapterNav) === JSON.stringify([
    { text: "← 上一章：洪武朝", href: "chapter.html?ch=hongwu", target: null },
    { text: "下一章：土木堡与北京保卫战 →", href: "chapter.html?ch=tumubao", target: null },
  ]), JSON.stringify(s.chapterNav));
  const beforeTabs = (await pages()).length;
  await trustedClick('.ch-chapter-link[href="chapter.html?ch=tumubao"]');
  await sleep(1600);
  check("下一章 nav switches same-tab", (await evalJs("location.search")) === "?ch=tumubao" && (await pages()).length === beforeTabs, await evalJs("location.search"));

  // 4) chapter one intact (4 slips, three tabs)
  await nav(BASE + "/chapter.html");
  s = await snap();
  check("chapter one intact: 4 slips, first tab current", s.secs.filter(x => x.slips === 1).length === 4 && s.tabs[0].current === true && s.head === "白话明史 · 洪武朝", JSON.stringify(s.secs.map(x => x.slips)));

  // 5) index/cards third links
  await nav(BASE + "/index.html");
  const idx = await evalJs(`(() => { const as = [...document.querySelectorAll('.ch-entry-second')]; return as.map(a => ({ text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })); })()`);
  check("index seven small links in order, all new tab", JSON.stringify(idx) === JSON.stringify([
    { text: "第二章 · 建文与靖难 →", href: "chapter.html?ch=jingnan", target: "_blank", rel: "noopener" },
    { text: "第三章 · 土木堡与北京保卫战 →", href: "chapter.html?ch=tumubao", target: "_blank", rel: "noopener" },
    { text: "第四章 · 嘉靖与海瑞 →", href: "chapter.html?ch=jiajing", target: "_blank", rel: "noopener" },
    { text: "第五章 · 张居正 →", href: "chapter.html?ch=zhangjuzheng", target: "_blank", rel: "noopener" },
    { text: "第六章 · 万历怠政 →", href: "chapter.html?ch=wanli", target: "_blank", rel: "noopener" },
    { text: "第七章 · 崇祯 →", href: "chapter.html?ch=chongzhen", target: "_blank", rel: "noopener" },
    { text: "终章 · 徐霞客 →", href: "chapter.html?ch=xuxiake", target: "_blank", rel: "noopener" },
  ]), JSON.stringify(idx));
  await trustedClick('.ch-entry-second[href="chapter.html?ch=tumubao"]');
  await expectNewTab("index third link opens chapter three new tab", BASE + "/chapter.html?ch=tumubao");
  await nav(BASE + "/cards.html");
  const cw = await evalJs(`(() => { const as = [...document.querySelectorAll('.cw-banner-second')]; return as.map(a => ({ text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })); })()`);
  check("cards seven small links in order, all new tab", JSON.stringify(cw) === JSON.stringify([
    { text: "第二章 · 建文与靖难 →", href: "chapter.html?ch=jingnan", target: "_blank", rel: "noopener" },
    { text: "第三章 · 土木堡与北京保卫战 →", href: "chapter.html?ch=tumubao", target: "_blank", rel: "noopener" },
    { text: "第四章 · 嘉靖与海瑞 →", href: "chapter.html?ch=jiajing", target: "_blank", rel: "noopener" },
    { text: "第五章 · 张居正 →", href: "chapter.html?ch=zhangjuzheng", target: "_blank", rel: "noopener" },
    { text: "第六章 · 万历怠政 →", href: "chapter.html?ch=wanli", target: "_blank", rel: "noopener" },
    { text: "第七章 · 崇祯 →", href: "chapter.html?ch=chongzhen", target: "_blank", rel: "noopener" },
    { text: "终章 · 徐霞客 →", href: "chapter.html?ch=xuxiake", target: "_blank", rel: "noopener" },
  ]), JSON.stringify(cw));
  await trustedClick('.cw-banner-second[href="chapter.html?ch=tumubao"]');
  await expectNewTab("cards third link opens chapter three new tab", BASE + "/chapter.html?ch=tumubao");

  // 6) 390px + zero errors
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/chapter.html?ch=tumubao");
  const mob = await evalJs(`document.documentElement.scrollWidth`);
  check("390px chapter three no overflow", mob <= 390, mob);
  await send("Emulation.clearDeviceMetricsOverride");
  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));

  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify37 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });