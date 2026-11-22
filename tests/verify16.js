const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9255;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud17`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const sceneState = () => evalJs(`(() => { const box = document.querySelector('.ql-scene'); const st = [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent); return { label: box.querySelector('.ql-scene-label').textContent, locked: !!box.dataset.locked, disabled: [...box.querySelectorAll('.ql-choice')].every(b => b.disabled), cons: box.querySelector('.ql-cons-p').textContent, hist: box.querySelector('.ql-hist-p').textContent, delta: box.querySelector('.ql-delta').hidden ? null : box.querySelector('.ql-delta').textContent, stats: st, nextHidden: document.querySelector('.ql-next').hidden, nextText: document.querySelector('.ql-next').textContent }; })()`);
const endingState = () => evalJs(`(() => { const e = document.querySelector('.ql-ending'); return e ? { title: e.querySelector('.ql-ending-title').textContent, text: e.querySelector('.ql-ending-text').textContent, closure: e.querySelector('.ql-closure-p').textContent, chatHref: e.querySelector('.ql-tochat').getAttribute('href'), btns: [...e.querySelectorAll('.ql-ending-btns .cta-button')].map(b => b.textContent) } : null; })()`);
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
  await nav("http://127.0.0.1:4173/decisions.html");
  await evalJs(`localStorage.setItem('${KEY}', JSON.stringify(${JSON.stringify(OLD)}))`);
  await nav("http://127.0.0.1:4173/decisions.html");

  const sec = await evalJs(`(() => ({ title: [...document.querySelectorAll('.ql-section .section-title')].map(x => x.textContent)[0], hint: document.querySelector('.ql-section .section-hint').textContent, cards: [...document.querySelectorAll('.ql-card')].map(c => ({ year: c.querySelector('.ql-year').textContent, title: c.querySelector('.ql-title').textContent, locked: c.classList.contains('is-locked'), btn: c.querySelector('.ql-play-btn').textContent, themeHidden: c.querySelector('.ql-theme').hidden })), dcCount: document.querySelector('.dc-count').textContent }))()`);
  check("section title/hint verbatim + 5 cards chronological + only 1449 playable", sec.title === "亲历 · 长剧本" && sec.hint === "记住历史最好的方式，是亲身经历一遍历史——选一个身份，活过一段大明。" && JSON.stringify(sec.cards.map(c => c.year)) === JSON.stringify(["1380", "1449", "1548", "1581", "1644"]) && sec.cards.filter(c => !c.locked).length === 1 && sec.cards[1].btn === "进入亲历" && sec.dcCount === "1 / 3", JSON.stringify(sec));
  const lockedClick = await evalJs(`(() => { const c = document.querySelectorAll('.ql-card')[0]; c.querySelector('.ql-play-btn').click(); return { theme: c.querySelector('.ql-theme').textContent, hidden: c.querySelector('.ql-theme').hidden, playHidden: document.querySelector('.ql-play').hidden }; })()`);
  const themeExpect = await evalJs(`SITE_DATA.qinli[0].theme`);
  check("locked card click reveals theme only, no play", lockedClick.theme === themeExpect && !lockedClick.hidden && lockedClick.playHidden, JSON.stringify(lockedClick));
  await shot("ql-cards");

  await evalJs(`document.querySelectorAll('.ql-card')[1].querySelector('.ql-play-btn').click()`);
  await sleep(500);
  const head = await evalJs(`(() => ({ role: document.querySelector('.ql-story-role-text').textContent, opening: document.querySelector('.ql-story-opening-text').textContent, stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent), widths: [...document.querySelectorAll('.ql-bar-fill')].map(x => x.style.width) }))()`);
  const s0 = await evalJs(`SITE_DATA.qinli[1]`);
  check("play opens: role/opening verbatim, stats 50/50 bars 50%", head.role === s0.roleText && head.opening === s0.opening && JSON.stringify(head.stats) === JSON.stringify(["50", "50"]) && JSON.stringify(head.widths) === JSON.stringify(["50%", "50%"]), JSON.stringify(head));
  await pickKey("A"); await sleep(400);
  const s1 = await sceneState();
  const cur1 = await evalJs(`JSON.parse(localStorage.getItem('${KEY}')).qinli`);
  check("scene1 A locks + consequence/history verbatim + delta + stats 60/45 + current saved", s1.locked && s1.disabled && s1.cons === s0.scenes[0].choices[0].consequence && s1.hist === s0.scenes[0].choices[0].history && s1.delta === "朝议声望 +10，京师军心 -5" && JSON.stringify(s1.stats) === JSON.stringify(["60", "45"]) && JSON.stringify(cur1.current) === JSON.stringify({ storyId: "q1449", sceneIndex: 1, prestige: 60, morale: 45 }) && JSON.stringify(cur1.done) === JSON.stringify([]), JSON.stringify([s1.delta, s1.stats, cur1]));
  const oldIntact = await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${KEY}')); return JSON.stringify(p.timeline) === JSON.stringify(${JSON.stringify(OLD.timeline)}) && JSON.stringify(p.decisions) === JSON.stringify(${JSON.stringify(OLD.decisions)}) && JSON.stringify(p.quiz) === JSON.stringify(${JSON.stringify(OLD.quiz)}); })()`);
  check("existing progress fields untouched", oldIntact, String(oldIntact));
  await shot("ql-play");
  await nextClick(); await sleep(400);
  await pickKey("A"); await sleep(400);
  await nav("http://127.0.0.1:4173/decisions.html");
  const resumed = await evalJs(`(() => ({ playHidden: document.querySelector('.ql-play').hidden, label: document.querySelector('.ql-scene-label').textContent, stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent), btn: document.querySelectorAll('.ql-card')[1].querySelector('.ql-play-btn').textContent }))()`);
  check("refresh auto-resumes at scene 3 with 70/55", !resumed.playHidden && resumed.label === s0.scenes[2].label && JSON.stringify(resumed.stats) === JSON.stringify(["70", "55"]), JSON.stringify(resumed));

  // hero path: scenes 3-8 all A
  for (let i = 2; i < 8; i++) { await pickKey("A"); await sleep(250); if (i < 7) { await nextClick(); await sleep(250); } }
  const fin = await sceneState();
  check("last scene button reads 走向结局", fin.nextText === "走向结局", fin.nextText);
  await nextClick(); await sleep(500);
  const eh = await endingState();
  const hero = s0.endings.find(e => e.id === "hero");
  const saveH = await evalJs(`JSON.parse(localStorage.getItem('${KEY}')).qinli`);
  check("hero ending verbatim + two buttons + chat link + done saved + current cleared", eh && eh.title === hero.title && eh.text === hero.text && eh.closure === hero.closure && eh.chatHref === "chat.html?figure=yuqian" && JSON.stringify(eh.btns) === JSON.stringify(["再活一次", "去跟于谦聊聊"]) && JSON.stringify(saveH.done) === JSON.stringify(["q1449"]) && saveH.current === null, JSON.stringify([eh && eh.title, saveH]));
  const badge = await evalJs(`(() => { const c = document.querySelectorAll('.ql-card')[1]; return { done: c.classList.contains('is-done'), badge: c.querySelector('.ql-done').hidden ? null : c.querySelector('.ql-done').textContent }; })()`);
  check("card shows 已亲历", badge.done && badge.badge === "已亲历", JSON.stringify(badge));
  await shot("ql-ending-hero");
  await nav("http://127.0.0.1:4173/decisions.html");
  const badge2 = await evalJs(`(() => { const c = document.querySelectorAll('.ql-card')[1]; return { badge: c.querySelector('.ql-done').hidden ? null : c.querySelector('.ql-done').textContent, playHidden: document.querySelector('.ql-play').hidden }; })()`);
  check("badge persists after refresh, no auto-play without current", badge2.badge === "已亲历" && badge2.playHidden, JSON.stringify(badge2));

  // martyr path
  await evalJs(`document.querySelectorAll('.ql-card')[1].querySelector('.ql-play-btn').click()`); await sleep(400);
  for (let i = 0; i < 5; i++) { await pickKey("A"); await sleep(200); await nextClick(); await sleep(200); }
  await pickKey("C"); await sleep(500);
  const em = await endingState();
  const martyr = s0.endings.find(e => e.id === "martyr");
  const noScene7 = await evalJs(`!document.querySelector('.ql-scene')`);
  check("scene6 C jumps straight to 殉国 ending (no scene7)", em && em.title === martyr.title && em.text === martyr.text && em.closure === martyr.closure && noScene7, JSON.stringify([em && em.title, noScene7]));

  // plain path
  await evalJs(`document.querySelector('.ql-again').click()`); await sleep(400);
  const reset = await sceneState();
  check("再活一次 resets to scene1 50/50", reset.label === s0.scenes[0].label && JSON.stringify(reset.stats) === JSON.stringify(["50", "50"]) && !reset.locked, JSON.stringify(reset));
  const plainKeys = ["B", "C", "C", "C", "C", "B", "B", "B"];
  for (let i = 0; i < 8; i++) { await pickKey(plainKeys[i]); await sleep(200); if (i < 7) { await nextClick(); await sleep(200); } }
  await nextClick(); await sleep(500);
  const ep = await endingState();
  const plain = s0.endings.find(e => e.id === "plain");
  check("silence/fence path lands 平庸官 ending verbatim", ep && ep.title === plain.title && ep.text === plain.text && ep.closure === plain.closure, JSON.stringify(ep && ep.title));

  // chat deep link
  await nav("http://127.0.0.1:4173/chat.html?figure=yuqian");
  const chatSel = await evalJs(`(() => ({ cur: document.querySelector('.ct-figure.is-current .ct-figure-name').textContent, chips: [...document.querySelectorAll('.ct-chip')].map(c => c.textContent) }))()`);
  const yq = await evalJs(`SITE_DATA.chatFigures.find(f => f.id === 'yuqian').qas.map(q => q.q)`);
  check("chat.html?figure=yuqian preselects 于谦", chatSel.cur === "于谦" && JSON.stringify(chatSel.chips) === JSON.stringify(yq), JSON.stringify(chatSel));

  // profile & decisions denominators unchanged
  await nav("http://127.0.0.1:4173/profile.html"); await sleep(500);
  const pf = await evalJs(`[...document.querySelectorAll('.pf-count')].map(x => x.textContent)`);
  check("profile still 2/23, 1/3, 4/6 (qinli not counted)", JSON.stringify(pf) === JSON.stringify(["2 / 23", "1 / 3", "4 / 6"]), JSON.stringify(pf));

  // mobile: eight scenes playable, fonts, sticky stats, next visible
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/decisions.html");
  await evalJs(`document.querySelectorAll('.ql-card')[1].querySelector('.ql-play-btn').click()`); await sleep(500);
  const mob0 = await evalJs(`(() => { const b = document.querySelector('.ql-choice'); const cs = getComputedStyle(b); const choices = document.querySelector('.ql-choices'); return { fs: parseFloat(cs.fontSize), cols: getComputedStyle(choices).gridTemplateColumns.split(" ").length, ov: document.documentElement.scrollWidth - window.innerWidth }; })()`);
  check("mobile: choices >=16px single column, no h-overflow", mob0.fs >= 16 && mob0.cols === 1 && mob0.ov <= 0, JSON.stringify(mob0));
  let mobWalk = true; const mobDetail = [];
  for (let i = 0; i < 8; i++) {
    await pickKey("A"); await sleep(700);
    const m = await evalJs(`(() => { const stats = document.querySelector('.ql-stats').getBoundingClientRect(); const dc = document.querySelector('.dc-progress').getBoundingClientRect(); const nx = document.querySelector('.ql-next'); const nr = nx.hidden ? null : nx.getBoundingClientRect(); return { statsTop: stats.top, dcBottom: dc.bottom, nextVisible: nr ? (nr.bottom <= window.innerHeight + 1 && nr.top >= 0) : null }; })()`);
    mobDetail.push([i, Math.round(m.statsTop), Math.round(m.dcBottom), m.nextVisible]);
    if (m.statsTop < m.dcBottom - 2 || m.nextVisible === false) mobWalk = false;
    if (i < 7) { await nextClick(); await sleep(250); }
  }
  await nextClick(); await sleep(400);
  const mobEnd = await endingState();
  check("mobile: 8 scenes walkable, stats below dc strip, next never obscured, ending reached", mobWalk && mobEnd && mobEnd.title === "保卫战功臣", JSON.stringify(mobDetail));
  await shot("ql-mobile");

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });