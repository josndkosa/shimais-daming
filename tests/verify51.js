const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9316; const DIR = __dirname;
const BASE = "http://127.0.0.1:4173/";
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud53`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
const results = [];
const check = (n, ok, x) => { results.push({ n, ok }); console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + x)); };
const nav = async (u) => { await send("Page.navigate", { url: BASE + u }); await sleep(1100); };
const shot = async (n) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + n + ".png", Buffer.from(s.data, "base64")); };
const prog = () => ev(`localStorage.getItem(${JSON.stringify(KEY)})`);
const setProg = (o) => ev(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(o))}); true`);
const codex = () => ev(`(() => ({ count: (document.querySelector('.ql-codex-count')||{}).textContent || null, guide: (() => { const g = document.querySelector('.ql-codex-guide'); return !!g && !g.hidden; })(), cards: [...document.querySelectorAll('.ql-card')].map(c => ({ id: (c.href.match(/story=([a-z0-9]+)/)||[])[1], label: (c.querySelector('.ql-codex-label')||{}).textContent || null, cells: [...c.querySelectorAll('.ql-end-cell')].map(x => ({ t: x.textContent, lit: x.classList.contains('is-lit') })), old: (() => { const o = c.querySelector('.ql-codex-old'); return o && !o.hidden ? o.textContent : null; })() })) }))()`);
async function playToEnding(story, picks) {
  await nav("qinli-play.html?story=" + story);
  let ci = 0;
  for (let i = 0; i < 24; i++) {
    const done = await ev(`!!document.querySelector('.ql-ending')`);
    if (done) break;
    const hasNext = await ev(`(() => { const n = document.querySelector('.ql-stage .ql-next'); return !!n && !n.hidden; })()`);
    if (hasNext) { await ev(`document.querySelector('.ql-stage .ql-next').click()`); await sleep(240); continue; }
    const idx = picks[ci] || 0; ci++;
    await ev(`(() => { const bs = [...document.querySelectorAll('.ql-stage .ql-choice')].filter(b => !b.disabled); if (bs[${idx}]) bs[${idx}].click(); else if (bs[0]) bs[0].click(); })()`);
    await sleep(240);
  }
  return ev(`(() => { const t = document.querySelector('.ql-ending-title'); return t ? t.textContent : null; })()`);
}
const PATH_A = [0, 0, 0, 0, 0, 0, 0, 0];
const PATH_B = [0, 1, 0, 2, 2, 1, 0, 0];

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200)); };
  await send("Runtime.enable"); await send("Page.enable");
  await nav("qinli.html"); await ev(`localStorage.clear()`); await nav("qinli.html");

  let cx = await codex();
  check("fresh: codex 0/20 + guide, all cells ???, no old note", cx.count === "结局图鉴 0 / 20" && cx.guide && cx.cards.every(c => c.cells.every(x => !x.lit && x.t === "？？？") && !c.old), JSON.stringify(cx.count));
  const totals = await ev(`SITE_DATA.qinli.map(s => (s.endings||[]).length)`);
  check("endings total 20 and per-story counts", totals.reduce((a, b) => a + b, 0) === 20 && JSON.stringify(totals) === JSON.stringify([3, 3, 3, 3, 4, 4]), JSON.stringify(totals));

  // real playthrough q1581 path A
  const endA = await playToEnding("q1581", PATH_A);
  let p = JSON.parse(await prog());
  const idsA = (p.qinliEndings || {}).q1581 || [];
  check("play q1581 path A records one ending", !!endA && idsA.length === 1, JSON.stringify([endA, idsA]));
  await nav("qinli.html");
  cx = await codex();
  const cA = cx.cards.find(c => c.id === "q1581");
  const litA = cA.cells.filter(x => x.lit);
  check("list q1581 1/4, one lit full name, three ???, total 1/20", cA.label === "结局 1/4" && litA.length === 1 && litA[0].t === endA && cA.cells.filter(x => !x.lit).length === 3 && cx.count === "结局图鉴 1 / 20" && !cx.guide, JSON.stringify([cA, cx.count]));
  await shot("be-codex-1");

  // path B different ending
  const endB = await playToEnding("q1581", PATH_B);
  p = JSON.parse(await prog());
  const idsB = (p.qinliEndings || {}).q1581 || [];
  check("path B reaches a different ending -> 2 collected", endB !== endA && idsB.length === 2, JSON.stringify([endA, endB, idsB]));
  await nav("qinli.html");
  cx = await codex();
  const cB = cx.cards.find(c => c.id === "q1581");
  check("list q1581 2/4 two lit, total 2/20", cB.label === "结局 2/4" && cB.cells.filter(x => x.lit).length === 2 && cx.count === "结局图鉴 2 / 20", JSON.stringify([cB.label, cx.count]));

  // repeat path A -> dedup
  await playToEnding("q1581", PATH_A);
  p = JSON.parse(await prog());
  check("repeat same ending does not double count", ((p.qinliEndings || {}).q1581 || []).length === 2, JSON.stringify(p.qinliEndings));

  // lit cell click -> play page; unlit cell click -> stay + hint
  await nav("qinli.html");
  await ev(`(() => { const c = [...document.querySelectorAll('.ql-card')].find(x => x.href.includes('q1581')); const lit = c.querySelector('.ql-end-cell.is-lit'); lit.click(); })()`);
  await sleep(700);
  let href = await ev(`location.href`);
  check("lit cell click navigates to play page", href.includes("qinli-play.html?story=q1581"), href);
  await nav("qinli.html");
  await ev(`(() => { const c = [...document.querySelectorAll('.ql-card')].find(x => x.href.includes('q1581')); const un = [...c.querySelectorAll('.ql-end-cell')].find(x => !x.classList.contains('is-lit')); un.click(); })()`);
  await sleep(300);
  href = await ev(`location.href`);
  const hint = await ev(`(() => { const c = [...document.querySelectorAll('.ql-card')].find(x => x.href.includes('q1581')); return [...c.querySelectorAll('.ql-end-cell')].map(x => x.textContent); })()`);
  check("unlit cell click stays on list + hint", href.includes("qinli.html") && !href.includes("play") && hint.includes("尚未抵达"), JSON.stringify([href, hint]));

  // profile matches
  await nav("profile.html");
  const pf = await ev(`(document.querySelector('.pf-endings-line')||{}).textContent || null`);
  check("profile collected line 2/20 matches list", pf === "已收集结局 2/20", pf);

  // old save: done but no qinliEndings
  await setProg({ qinli: { done: ["q1380"], current: null } });
  await nav("qinli.html");
  cx = await codex();
  const old = cx.cards.find(c => c.id === "q1380");
  check("old save: 已通关 · 结局待收集, 0/3 all ???, total 0/20", old.old === "已通关 · 结局待收集" && old.label === "结局 0/3" && old.cells.every(x => !x.lit) && cx.count === "结局图鉴 0 / 20" && cx.guide, JSON.stringify([old, cx.count]));
  await nav("profile.html");
  const pf0 = await ev(`(document.querySelector('.pf-endings-line')||{}).textContent || null`);
  check("old save profile 0/20 no crash", pf0 === "已收集结局 0/20", pf0);

  // clear -> 0/20
  await ev(`localStorage.clear()`);
  await nav("qinli.html");
  cx = await codex();
  check("clear storage -> 0/20 + guide", cx.count === "结局图鉴 0 / 20" && cx.guide, JSON.stringify(cx.count));

  // mobile
  await setProg({ qinliEndings: { q1581: ["minren", "qingtian"] }, qinli: { done: ["q1581"], current: null } });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("qinli.html");
  const mob = await ev(`(() => ({ docW: document.documentElement.scrollWidth, lit: document.querySelectorAll('.ql-end-cell.is-lit').length }))()`);
  check("mobile 390: codex renders, no h-overflow", mob.docW <= 390 && mob.lit === 2, JSON.stringify(mob));
  await shot("be-codex-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });