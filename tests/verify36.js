const { spawn, execSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9294;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const ch2 = JSON.parse(fs.readFileSync(DIR + "/chapter2.json", "utf8"));
const headData = vm.runInContext(execSync("git show HEAD:frontend/data.js", { cwd: "D:/shimais-daming", encoding: "utf8" }) + "\nSITE_DATA;", vm.createContext({ window: {} }));
const oldCh = headData.chapter || headData.chapters[0];
const oldNext = (headData.chapterUI.next || headData.chapters[0].nextSteps).map((l) => ({ label: l.label, href: l.href.replace("qinli.html?story=", "qinli-play.html?story=") }));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud50`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const chapterSnap = () => evalJs(`(() => ({
  head: document.querySelector('.head-title').textContent,
  tabs: [...document.querySelectorAll('.ch-tab')].map(t => ({ text: t.textContent, href: t.getAttribute('href'), current: t.getAttribute('aria-current') === 'page', target: t.getAttribute('target') })),
  intro: document.querySelector('.ch-intro').textContent,
  secs: [...document.querySelectorAll('.ch-section')].map(s => ({ title: s.querySelector('.ch-sec-title').textContent, ps: [...s.querySelectorAll('.ch-p')].map(p => p.textContent), source: s.querySelector('.ch-source').textContent, slips: s.querySelectorAll('details.ch-sources').length, cards: s.querySelectorAll('.ch-slip').length })),
  chapterNav: [...document.querySelectorAll('.ch-chapter-link')].map(a => ({ text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target') })),
  next: [...document.querySelectorAll('.ch-next-link')].map(a => ({ label: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
  nextTitle: [...document.querySelectorAll('.ch-sec-title')].pop().textContent,
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

  // 1) default = chapter one, verbatim vs HEAD
  await nav(BASE + "/chapter.html");
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ timeline: { read: ["e1380"] }, sentinel: "aq" })); true`);
  const before = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav(BASE + "/chapter.html");
  let s = await chapterSnap();
  check("default shows chapter one head + tabs", s.head === "白话明史 · 洪武朝" && JSON.stringify(s.tabs) === JSON.stringify([
    { text: "第一章 · 洪武朝", href: "chapter.html?ch=hongwu", current: true, target: null },
    { text: "第二章 · 建文与靖难", href: "chapter.html?ch=jingnan", current: false, target: null },
    { text: "第三章 · 土木堡与北京保卫战", href: "chapter.html?ch=tumubao", current: false, target: null },
    { text: "第四章 · 嘉靖与海瑞", href: "chapter.html?ch=jiajing", current: false, target: null },
    { text: "第五章 · 张居正", href: "chapter.html?ch=zhangjuzheng", current: false, target: null },
    { text: "第六章 · 万历怠政", href: "chapter.html?ch=wanli", current: false, target: null },
    { text: "第七章 · 崇祯", href: "chapter.html?ch=chongzhen", current: false, target: null },
    { text: "终章 · 徐霞客", href: "chapter.html?ch=xuxiake", current: false, target: null },
  ]), JSON.stringify({ head: s.head, tabs: s.tabs }));
  const prefix = headData.chapterUI.sourcePrefix;
  const ch1Verbatim = s.intro === oldCh.intro && s.secs.length === 5 && s.secs.every((sec, i) =>
    sec.title === oldCh.sections[i].title && JSON.stringify(sec.ps) === JSON.stringify(oldCh.sections[i].paragraphs) &&
    sec.source === prefix + oldCh.sections[i].sourceNote && sec.cards === (oldCh.sections[i].sources || []).length && sec.slips === (i < 4 ? 1 : 0));
  check("chapter one moved verbatim (intro/5 sections/sources/slip counts)", ch1Verbatim, JSON.stringify(s.secs.map(x => [x.title, x.slips])));
  check("chapter one nextSteps verbatim + qinli new tab", JSON.stringify(s.next) === JSON.stringify(oldNext.map((l, i) => ({ label: l.label, href: l.href, target: i === 0 ? "_blank" : null, rel: i === 0 ? "noopener" : null }))), JSON.stringify(s.next));
  check("chapter one nav: 下一章 only", JSON.stringify(s.chapterNav) === JSON.stringify([{ text: "下一章：建文与靖难 →", href: "chapter.html?ch=jingnan", target: null }]), JSON.stringify(s.chapterNav));

  // 2) tab click switches in-page
  const beforeTabs = (await pages()).length;
  await trustedClick('.ch-tab[href="chapter.html?ch=jingnan"]');
  await sleep(1600);
  s = await chapterSnap();
  check("tab click switches same-tab to chapter two", (await evalJs("location.search")) === "?ch=jingnan" && (await pages()).length === beforeTabs && s.head === "白话明史 · 建文与靖难", JSON.stringify({ search: await evalJs("location.search"), head: s.head }));
  check("chapter two tab highlight moved", JSON.stringify(s.tabs.map(x => x.current)) === JSON.stringify([false, true, false, false, false, false, false, false]), JSON.stringify(s.tabs));

  // 3) chapter two verbatim vs spec JSON
  const ch2Verbatim = s.intro === ch2.intro && s.secs.length === 5 && s.secs.every((sec, i) =>
    sec.title === ch2.sections[i].title && JSON.stringify(sec.ps) === JSON.stringify(ch2.sections[i].paragraphs) &&
    sec.source === prefix + ch2.sections[i].sourceNote && sec.slips === 0);
  check("chapter two titles/paragraphs/sourceNotes verbatim, no slips", ch2Verbatim, JSON.stringify(s.secs.map(x => x.title)));
  check("chapter two key figures present", ["1370", "1380", "1392", "1399", "1402", "1420", "1457", "五十五年", "洪武三十五年", "三百年"].every(n => s.body.includes(n)), "missing");
  check("chapter two nav: 上一章 + 下一章", JSON.stringify(s.chapterNav) === JSON.stringify([
    { text: "← 上一章：洪武朝", href: "chapter.html?ch=hongwu", target: null },
    { text: "下一章：土木堡与北京保卫战 →", href: "chapter.html?ch=tumubao", target: null },
  ]), JSON.stringify(s.chapterNav));
  check("chapter two nextSteps exact + AP targets", JSON.stringify(s.next) === JSON.stringify(ch2.nextSteps.map((l, i) => ({ label: l.label, href: l.href.replace("qinli.html?story=", "qinli-play.html?story="), target: i === 0 ? "_blank" : null, rel: i === 0 ? "noopener" : null }))), JSON.stringify(s.next));
  check("chapter two 下一步 title kept", s.nextTitle === "下一步", s.nextTitle);
  const midStore = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  check("chapter visits and tab toggles write no progress", midStore === before, JSON.stringify({ before, midStore }));

  // 4) chapter two qinli step opens new tab
  await trustedClick('.ch-next-link[href="qinli-play.html?story=q1402"]');
  await expectNewTab("chapter two 亲历《金陵》 opens q1402 new tab", BASE + "/qinli-play.html?story=q1402");
  check("chapter two origin preserved", (await evalJs("location.pathname + location.search")) === "/chapter.html?ch=jingnan", await evalJs("location.pathname + location.search"));

  // 5) chapter nav back to chapter one same-tab
  await trustedClick(".ch-chapter-link");
  await sleep(1600);
  check("上一章 nav returns same-tab", (await evalJs("location.search")) === "?ch=hongwu" && (await evalJs("document.querySelector('.head-title').textContent")) === "白话明史 · 洪武朝", await evalJs("location.search"));

  // 6) unknown ch fallback
  await nav(BASE + "/chapter.html?ch=xxx");
  s = await chapterSnap();
  check("unknown ch falls back to chapter one", s.intro === oldCh.intro && s.tabs[0].current === true && s.head === "白话明史 · 洪武朝", JSON.stringify({ head: s.head, tabs: s.tabs.map(x => x.current) }));

  // 7) index second link
  await nav(BASE + "/index.html");
  const idx = await evalJs(`(() => { const a = document.querySelector('.ch-entry-second'); const main = document.querySelector('.ch-entry .cta-button'); return { second: a ? { text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null, main: { href: main.getAttribute('href'), target: main.getAttribute('target') } }; })()`);
  check("index second-chapter link verbatim + new tab, main unchanged", JSON.stringify(idx.second) === JSON.stringify({ text: "第二章 · 建文与靖难 →", href: "chapter.html?ch=jingnan", target: "_blank", rel: "noopener" }) && idx.main.href === "chapter.html" && idx.main.target === "_blank", JSON.stringify(idx));
  await trustedClick(".ch-entry-second");
  await expectNewTab("index second link opens chapter two new tab", BASE + "/chapter.html?ch=jingnan");

  // 8) cards second link
  await nav(BASE + "/cards.html");
  const cw = await evalJs(`(() => { const a = document.querySelector('.cw-banner-second'); const main = document.querySelector('.cw-banner-main'); return { second: a ? { text: a.textContent, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null, main: { href: main.getAttribute('href'), target: main.getAttribute('target') } }; })()`);
  check("cards second-chapter link verbatim + new tab, banner unchanged", JSON.stringify(cw.second) === JSON.stringify({ text: "第二章 · 建文与靖难 →", href: "chapter.html?ch=jingnan", target: "_blank", rel: "noopener" }) && cw.main.href === "chapter.html" && cw.main.target === "_blank", JSON.stringify(cw));
  await trustedClick(".cw-banner-second");
  await expectNewTab("cards second link opens chapter two new tab", BASE + "/chapter.html?ch=jingnan");

  // 9) 390px both chapters
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/chapter.html?ch=jingnan");
  const mob2 = await evalJs(`document.documentElement.scrollWidth`);
  await nav(BASE + "/chapter.html");
  const mob1 = await evalJs(`document.documentElement.scrollWidth`);
  check("390px both chapters no overflow", mob1 <= 390 && mob2 <= 390, JSON.stringify({ mob1, mob2 }));
  await send("Emulation.clearDeviceMetricsOverride");

  // 10) final chapter-only visit writes nothing + zero errors
  const preFinal = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav(BASE + "/chapter.html?ch=jingnan");
  const after = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  check("final chapter visit writes nothing", after === preFinal, JSON.stringify({ preFinal, after }));
  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));

  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify36 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });