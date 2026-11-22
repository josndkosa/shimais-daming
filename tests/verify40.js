const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9300;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const STORIES = ["q1380", "q1402", "q1449", "q1548", "q1581", "q1644"];
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud56`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1700); };
const pages = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((x) => x.type === "page");
const prog = () => evalJs(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}')`);
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
async function playThrough() {
  for (let i = 0; i < 60; i++) {
    const st = await evalJs(`(() => ({ ending: !!document.querySelector('.ql-ending'), choice: !!document.querySelector('.ql-choice:not([disabled])'), next: (() => { const n = document.querySelector('.ql-next'); return !!n && !n.hidden; })() }))()`);
    if (st.ending) return true;
    if (st.choice) await evalJs(`document.querySelector('.ql-choice:not([disabled])').click(); true`);
    else if (st.next) await evalJs(`document.querySelector('.ql-next').click(); true`);
    else return false;
    await sleep(220);
  }
  return false;
}

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

  // 1) pure list
  await nav(BASE + "/qinli.html");
  await evalJs("localStorage.clear(); true");
  await nav(BASE + "/qinli.html");
  const list = await evalJs(`(() => ({
    cards: [...document.querySelectorAll('.ql-card')].map(c => ({ tag: c.tagName, href: c.getAttribute('href'), target: c.getAttribute('target') })),
    player: document.querySelectorAll('.ql-play, .ql-choice').length,
    nav: document.querySelectorAll('.nav-link').length
  }))()`);
  check("list: six whole-card same-tab links to play page", list.cards.length === 6 && list.cards.every((c, i) => c.tag === "A" && c.href === "qinli-play.html?story=" + STORIES[i] && c.target === null), JSON.stringify(list.cards));
  check("list: no embedded player, nav intact", list.player === 0 && list.nav === 10, JSON.stringify(list));

  // 2) card click -> same-tab play, no nav, player from top
  const beforePages = (await pages()).length;
  await trustedClick('a.ql-card[href="qinli-play.html?story=q1380"]');
  await sleep(1700);
  const play = await evalJs(`(() => ({
    url: location.pathname + location.search, nav: document.querySelectorAll('.nav-link, .site-nav').length,
    back: document.querySelector('.qp-back').getAttribute('href'), backTarget: document.querySelector('.qp-back').getAttribute('target'),
    title: document.querySelector('.qp-title').textContent, meta: document.querySelector('.qp-meta').textContent,
    scrollY: window.scrollY, choices: document.querySelectorAll('.ql-choice').length, stats: document.querySelectorAll('.ql-stat-row').length,
    entries: document.querySelectorAll('.entry-block, .ql-cards').length
  }))()`);
  check("card click lands play page same-tab", play.url === "/qinli-play.html?story=q1380" && (await pages()).length === beforePages, JSON.stringify(play));
  check("play: no site nav, no module entries, thin bar correct", play.nav === 0 && play.entries === 0 && play.back === "qinli.html" && play.backTarget === null && play.title.length > 0 && play.meta.includes("·"), JSON.stringify(play));
  check("play: player from top with choices and meters", play.scrollY === 0 && play.choices === 3 && play.stats === 2, JSON.stringify(play));

  // 3) play q1380 to ending; progress semantics
  const ended = await playThrough();
  const p1 = await prog();
  check("q1380 playable to ending", ended, "no ending reached");
  check("ending writes done + clears current", p1.qinli && p1.qinli.done.includes("q1380") && p1.qinli.current === null, JSON.stringify(p1.qinli));
  const endLinks = await evalJs(`(() => ({ chat: document.querySelector('.ql-tochat') ? document.querySelector('.ql-tochat').getAttribute('href') : null, again: !!document.querySelector('.ql-again') }))()`);
  check("ending keeps 跟他聊聊 + 再活一次", endLinks.chat === "chat.html?figure=zhuyuanzhang" && endLinks.again, JSON.stringify(endLinks));

  // 4) all six stories playable to ending
  for (const id of STORIES.slice(1)) {
    await nav(BASE + "/qinli-play.html?story=" + id);
    const ok = await playThrough();
    const p = await prog();
    check(id + " playable to ending + done recorded", ok && p.qinli.done.includes(id), JSON.stringify({ ok, done: p.qinli && p.qinli.done }));
  }

  // 5) mid-story refresh resumes
  await nav(BASE + "/qinli-play.html?story=q1402");
  await evalJs(`document.querySelector('.ql-choice:not([disabled])').click(); true`);
  await sleep(300);
  await evalJs(`document.querySelector('.ql-next').click(); true`);
  await sleep(400);
  const mid = await prog();
  await nav(BASE + "/qinli-play.html?story=q1402");
  const resumed = await evalJs(`(() => ({ label: document.querySelector('.ql-scene-label').textContent, vals: [...document.querySelectorAll('.ql-stat-val')].map(n => n.textContent) }))()`);
  check("refresh resumes scene and numbers", mid.qinli.current && mid.qinli.current.storyId === "q1402" && resumed.label.includes("第二场") && JSON.stringify(resumed.vals) === JSON.stringify([String(mid.qinli.current.prestige), String(mid.qinli.current.morale)]), JSON.stringify({ mid: mid.qinli.current, resumed }));

  // 6) profile stats + resume link after completions
  await nav(BASE + "/profile.html");
  const pf = await evalJs(`(() => {
    const stat = [...document.querySelectorAll('.pf-stat')].find(s => s.textContent.includes('亲历'));
    const ql = document.querySelector('.pf-link[href^="qinli"]');
    const resume = [...document.querySelectorAll('.cta-gold')].find(a => (a.getAttribute('href') || '').startsWith('qinli'));
    return { count: stat.querySelector('.pf-count').textContent, ql: ql ? { href: ql.getAttribute('href'), target: ql.getAttribute('target') } : null, resume: resume ? { href: resume.getAttribute('href'), target: resume.getAttribute('target'), rel: resume.getAttribute('rel') } : null };
  })()`);
  check("profile: 6/6 done, resume links to play new tab", pf.count === "6 / 6" && pf.ql.href === "qinli-play.html?story=q1402" && pf.ql.target === "_blank" && pf.resume && pf.resume.href === "qinli-play.html?story=q1402" && pf.resume.target === "_blank" && pf.resume.rel === "noopener", JSON.stringify(pf));
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}'); p.qinli.current = null; localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify(p)); return true; })()`);
  await nav(BASE + "/profile.html");
  const pfFallback = await evalJs(`(() => { const ql = document.querySelector('.pf-link[href^="qinli"]'); return { href: ql.getAttribute('href'), target: ql.getAttribute('target') }; })()`);
  check("profile: no current -> fallback list link", pfFallback.href === "qinli.html", JSON.stringify(pfFallback));

  // 7) list done badges
  await nav(BASE + "/qinli.html");
  const badges = await evalJs(`[...document.querySelectorAll('.ql-card')].map(c => ({ id: c.getAttribute('href').split('=')[1], done: !c.querySelector('.ql-done').hidden }))`);
  check("list: done badges for all six", badges.every(b => b.done), JSON.stringify(badges));

  // 8) old deep link + invalid fallbacks
  await nav(BASE + "/qinli.html?story=q1449");
  check("old qinli.html?story= redirects to play", (await evalJs("location.pathname + location.search")) === "/qinli-play.html?story=q1449", await evalJs("location.pathname + location.search"));
  await nav(BASE + "/qinli-play.html?story=nope");
  check("invalid play story falls back to list", (await evalJs("location.pathname")) === "/qinli.html", await evalJs("location.pathname"));

  // 9) content-area links retargeted + new tab
  await nav(BASE + "/chapter.html");
  const chLink = await evalJs(`(() => { const a = document.querySelector('.ch-next-link'); return { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }; })()`);
  check("chapter nextStep retargeted + AP", chLink.href === "qinli-play.html?story=q1380" && chLink.target === "_blank" && chLink.rel === "noopener", JSON.stringify(chLink));
  await trustedClick(".ch-next-link");
  await expectNewTab("chapter story link opens play page new tab", BASE + "/qinli-play.html?story=q1380");
  await nav(BASE + "/chat.html?figure=zhuyuanzhang");
  const ct = await evalJs(`(() => { const a = document.querySelector('.ct-qinli-link'); return { href: a.getAttribute('href'), target: a.getAttribute('target') }; })()`);
  check("chat cross-link retargeted + AP", ct.href === "qinli-play.html?story=q1380" && ct.target === "_blank", JSON.stringify(ct));
  await nav(BASE + "/cards.html?card=i3");
  const tp = await evalJs(`(() => { const a = document.querySelector('.topic-path .topic-next'); return { href: a.getAttribute('href'), target: a.getAttribute('target') }; })()`);
  check("topic next retargeted + AP", tp.href === "qinli-play.html?story=q1581" && tp.target === "_blank", JSON.stringify(tp));

  // 10) back to list same-tab
  await nav(BASE + "/qinli-play.html?story=q1380");
  const bp = (await pages()).length;
  await trustedClick(".qp-back");
  await sleep(1500);
  check("← 亲历 returns to list same-tab", (await evalJs("location.pathname")) === "/qinli.html" && (await pages()).length === bp, await evalJs("location.pathname"));

  // 11) 390px play page
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/qinli-play.html?story=q1581");
  const mob = await evalJs(`document.documentElement.scrollWidth`);
  check("390px play page no overflow", mob <= 390, mob);
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify40 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });