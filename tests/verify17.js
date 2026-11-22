const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9257;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud19`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1300); };
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const pickKey = (k) => evalJs(`(() => { const box = document.querySelector('.ql-scene'); const btn = [...box.querySelectorAll('.ql-choice')].find(b => b.querySelector('.ql-key').textContent === '${k}'); btn.click(); return true; })()`);
const nextClick = () => evalJs(`document.querySelector('.ql-next').click()`);
const sceneState = () => evalJs(`(() => { const box = document.querySelector('.ql-scene'); return { label: box.querySelector('.ql-scene-label').textContent, locked: !!box.dataset.locked, stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent), nextText: document.querySelector('.ql-next').textContent, nextHidden: document.querySelector('.ql-next').hidden }; })()`);
const endingState = () => evalJs(`(() => { const e = document.querySelector('.ql-ending'); return e ? { title: e.querySelector('.ql-ending-title').textContent, text: e.querySelector('.ql-ending-text').textContent, closure: e.querySelector('.ql-closure-p').textContent, chatHref: e.querySelector('.ql-tochat').getAttribute('href'), btns: [...e.querySelectorAll('.ql-ending-btns .cta-button')].map(b => b.textContent) } : null; })()`);
const NAVORDER = ["首页", "时间线", "帝王首辅", "决策模式", "亲历", "人物与制度卡", "史料检索", "人物对话", "小测", "研读画像"];
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
  const OLD = { timeline: { read: ["e1368", "e1380"] }, decisions: { done: ["d1380"], picks: { d1380: "B" } }, quiz: { picks: [1,1,2,1,0,1,2,0,2,1], score: 10, dims: { timeline: { hit: 4, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 3, total: 3 } } } };

  // decisions: only 3 scenarios + entry strip
  await nav("http://127.0.0.1:4173/decisions.html");
  await evalJs(`localStorage.setItem('${KEY}', JSON.stringify(${JSON.stringify(OLD)}))`);
  await nav("http://127.0.0.1:4173/decisions.html");
  const dec = await evalJs(`(() => ({ scenarios: document.querySelectorAll('.dc-scenario').length, cards: document.querySelectorAll('.ql-card').length, play: document.querySelectorAll('.ql-play').length, entryText: document.querySelector('.ql-entry-text') ? document.querySelector('.ql-entry-text').textContent : null, entryHref: document.querySelector('.ql-entry-link') ? document.querySelector('.ql-entry-link').getAttribute('href') : null, entryLabel: document.querySelector('.ql-entry-link') ? document.querySelector('.ql-entry-link').textContent : null, count: document.querySelector('.dc-count').textContent }))()`);
  check("decisions: 3 scenarios, no qinli block, entry strip text+link", dec.scenarios === 3 && dec.cards === 0 && dec.play === 0 && dec.entryText === "亲历 · 长剧本——选一个身份，活过一段大明。" && dec.entryHref === "qinli.html" && dec.entryLabel === "进入亲历 →" && dec.count === "1 / 3", JSON.stringify(dec));
  await shot("decisions-entry");

  // qinli page: six cards, nav nine, head
  await nav("http://127.0.0.1:4173/qinli.html");
  const page = await evalJs(`(() => ({ nav: [...document.querySelectorAll('.nav-link')].map(a => a.querySelector('.nav-full').textContent), cur: document.querySelector('.nav-link.is-current .nav-full').textContent, head: document.querySelector('.head-title').textContent, hint: document.querySelector('.head-hint').textContent, cards: [...document.querySelectorAll('.ql-card')].map(c => ({ year: c.querySelector('.ql-year').textContent, title: c.querySelector('.ql-title').textContent, role: c.querySelector('.ql-role').textContent, locked: c.classList.contains('is-locked'), btn: c.querySelector('.ql-play-btn').textContent })) }))()`);
  const jw = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1402')`);
  check("nav nine in order + qinli current + head verbatim", JSON.stringify(page.nav) === JSON.stringify(NAVORDER) && page.cur === "亲历" && page.head === "亲历 · 长剧本" && page.hint === "记住历史最好的方式，是亲身经历一遍历史——选一个身份，活过一段大明。", JSON.stringify([page.nav, page.cur]));
  check("six cards chronological, 1402 role/theme verbatim, zero locked", JSON.stringify(page.cards.map(c => c.year)) === JSON.stringify(["1380", "1402", "1449", "1548", "1581", "1644"]) && page.cards[1].role === jw.role && page.cards.filter(c => c.locked).length === 0 && page.cards[2].btn === "进入亲历", JSON.stringify(page.cards.map(c => [c.year, c.locked])));
  const jwTheme = await evalJs(`(() => { const c = document.querySelectorAll('.ql-card')[3]; return { btn: c.querySelector('.ql-play-btn').textContent, locked: c.classList.contains('is-locked') }; })()`);
  check("1548 now playable", jwTheme.btn === "进入亲历" && !jwTheme.locked, JSON.stringify(jwTheme));
  await shot("qinli-cards");

  // seamless resume of saved mid-play progress (list shows 继续亲历; play page resumes)
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${KEY}')); p.qinli = { done: [], current: { storyId: 'q1449', sceneIndex: 3, prestige: 80, morale: 70 } }; localStorage.setItem('${KEY}', JSON.stringify(p)); })()`);
  await nav("http://127.0.0.1:4173/qinli.html");
  const resumeBtn = await evalJs(`document.querySelectorAll('.ql-card')[2].querySelector('.ql-play-btn').textContent`);
  await nav("http://127.0.0.1:4173/qinli-play.html?story=q1449");
  const res = await evalJs(`(() => ({ playHidden: document.querySelector('.ql-play').hidden, label: document.querySelector('.ql-scene-label').textContent, stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent) }))()`);
  const s4label = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1449').scenes[3].label`);
  check("saved mid-play progress resumes seamlessly on play page", !res.playHidden && res.label === s4label && JSON.stringify(res.stats) === JSON.stringify(["80", "70"]) && resumeBtn === "继续亲历", JSON.stringify({ res, resumeBtn }));

  // mid-walk refresh resume
  await pickKey("A"); await sleep(400);
  await nextClick(); await sleep(400);
  await nav("http://127.0.0.1:4173/qinli-play.html?story=q1449");
  const res2 = await evalJs(`(() => ({ label: document.querySelector('.ql-scene-label').textContent, stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent) }))()`);
  const s6label = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1449').scenes[4].label`);
  check("refresh mid-walk resumes at scene 5 with updated stats", res2.label === s6label && JSON.stringify(res2.stats) === JSON.stringify(["85", "80"]), JSON.stringify(res2));

  // finish hero from scene 6
  for (let i = 4; i < 8; i++) { await pickKey("A"); await sleep(250); if (i < 7) { await nextClick(); await sleep(250); } }
  await nextClick(); await sleep(500);
  const eh = await endingState();
  const hero = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1449').endings.find(e => e.id === 'hero')`);
  const heroCfg = await evalJs(`(() => { const st = SITE_DATA.qinli.find(x => x.id === "q1449"); const cl = st.chatLink || { label: SITE_DATA.qinliUI.toChat, href: "chat.html?figure=yuqian" }; return { href: cl.href, btns: [SITE_DATA.qinliUI.restart, cl.label].concat(st.followups.map(f => f.label)) }; })()`);
  const saveH = await evalJs(`JSON.parse(localStorage.getItem('${KEY}')).qinli`);
  check("hero ending verbatim + buttons + deep link + done/current", eh && eh.title === hero.title && eh.text === hero.text && eh.closure === hero.closure && eh.chatHref === heroCfg.href && JSON.stringify(eh.btns) === JSON.stringify(heroCfg.btns) && JSON.stringify(saveH.done) === JSON.stringify(["q1449"]) && saveH.current === null, JSON.stringify([eh && eh.title, saveH]));
  await shot("qinli-play");

  // martyr
  await evalJs(`document.querySelector('.ql-again').click()`); await sleep(400);
  for (let i = 0; i < 5; i++) { await pickKey("A"); await sleep(200); await nextClick(); await sleep(200); }
  await pickKey("C"); await sleep(500);
  const em = await endingState();
  const martyr = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1449').endings.find(e => e.id === 'martyr')`);
  check("scene6 C straight to 殉国 on new page", em && em.title === martyr.title && em.closure === martyr.closure && await evalJs(`!document.querySelector('.ql-scene')`), JSON.stringify(em && em.title));

  // plain
  await evalJs(`document.querySelector('.ql-again').click()`); await sleep(400);
  const keys = ["B", "C", "C", "C", "C", "B", "B", "B"];
  for (let i = 0; i < 8; i++) { await pickKey(keys[i]); await sleep(200); if (i < 7) { await nextClick(); await sleep(200); } }
  await nextClick(); await sleep(500);
  const ep = await endingState();
  const plain = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1449').endings.find(e => e.id === 'plain')`);
  check("plain ending reachable on new page", ep && ep.title === plain.title && ep.text === plain.text, JSON.stringify(ep && ep.title));
  await nav("http://127.0.0.1:4173/qinli.html");
  const badge = await evalJs(`(() => { const c = document.querySelectorAll('.ql-card')[2]; return c.querySelector('.ql-done').hidden ? null : c.querySelector('.ql-done').textContent; })()`);
  check("已亲历 badge on list page", badge === "已亲历", String(badge));

  // homepage & profile unchanged
  await nav("http://127.0.0.1:4173/index.html");
  const ent = await evalJs(`[...document.querySelectorAll('.entry-index')].map(x => x.textContent)`);
  check("homepage catalog still 6", JSON.stringify(ent) === JSON.stringify(["01","02","03","04","05","06"]), JSON.stringify(ent));
  await nav("http://127.0.0.1:4173/profile.html"); await sleep(500);
  const pf = await evalJs(`[...document.querySelectorAll('.pf-count')].map(x => x.textContent)`);
  check("profile still X/6 (4/6 with seed)", JSON.stringify(pf) === JSON.stringify(["2 / 23", "1 / 3", "1 / 6", "4 / 6"]), JSON.stringify(pf));

  // mobile walk
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`document.querySelectorAll('.ql-card')[2].click()`); await sleep(900);
  const mob0 = await evalJs(`(() => { const cs = getComputedStyle(document.querySelector('.ql-choice')); const bar = document.querySelector('.qp-bar').getBoundingClientRect(); const st = document.querySelector('.ql-stats').getBoundingClientRect(); return { fs: parseFloat(cs.fontSize), ov: document.documentElement.scrollWidth - window.innerWidth, statsTop: st.top, barBottom: bar.bottom, noNav: !document.querySelector('.site-nav') }; })()`);
  check("mobile: choices >=16px, no overflow, no site nav, stats below bar", mob0.fs >= 16 && mob0.ov <= 0 && mob0.noNav && mob0.statsTop >= mob0.barBottom - 2, JSON.stringify(mob0));
  let walk = true;
  for (let i = 0; i < 8; i++) {
    await pickKey("A"); await sleep(600);
    const m = await evalJs(`(() => { const nx = document.querySelector('.ql-next'); const r = nx.hidden ? null : nx.getBoundingClientRect(); const st = document.querySelector('.ql-stats').getBoundingClientRect(); return { nextOk: r ? (r.bottom <= window.innerHeight + 1 && r.top >= 0) : null, statsOk: st.top >= 0 }; })()`);
    if (m.nextOk === false || !m.statsOk) walk = false;
    if (i < 7) { await nextClick(); await sleep(300); }
  }
  await nextClick(); await sleep(400);
  const me = await endingState();
  check("mobile eight-scene walk to hero ending", walk && me && me.title === "保卫战功臣", JSON.stringify([walk, me && me.title]));
  await shot("qinli-mobile");

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });