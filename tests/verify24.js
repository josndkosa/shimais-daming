const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9268;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud30`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const SERIF = /Noto Serif SC|Songti SC|Source Han Serif SC|FangSong|STFangsong|serif/;
const SANS = /PingFang SC|Microsoft YaHei|Noto Sans SC|system-ui|sans-serif/;
const fontOf = (sel) => evalJs(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); return n ? getComputedStyle(n).fontFamily : null; })()`);
const sizeOf = (sel) => evalJs(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); return n ? getComputedStyle(n).fontSize : null; })()`);

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

  // index: serif headline / sans body / nav / carousel overflow / muted
  await nav("http://127.0.0.1:4173/index.html");
  const idx = await evalJs(`(() => {
    const h = document.querySelector('.slide-headline');
    const hr = h.getBoundingClientRect();
    const car = document.querySelector('.carousel').getBoundingClientRect();
    const nav = document.querySelector('.site-nav');
    const tops = [...document.querySelectorAll('.nav-link')].map(a => a.offsetTop);
    return { head: getComputedStyle(h).fontFamily, headOverflow: h.scrollWidth > h.clientWidth + 1 || hr.right > car.right + 1 || hr.left < car.left - 1, navH: nav.offsetHeight, oneRow: new Set(tops).size === 1, muted: getComputedStyle(document.documentElement).getPropertyValue('--site-muted').trim(), body: getComputedStyle(document.querySelector('.entry-title') || document.body).fontFamily, entryIdx: getComputedStyle(document.querySelector('.entry-index')).fontFamily, cta: getComputedStyle(document.querySelector('.cta-button')).fontFamily };
  })()`);
  check("index: headline serif, no carousel overflow, nav single row", SERIF.test(idx.head) && !idx.headOverflow && idx.navH <= 60 && idx.oneRow, JSON.stringify(idx));
  check("index: muted new value, entry-index serif, cta sans", idx.muted === "#a29a8b" && SERIF.test(idx.entryIdx) && SANS.test(idx.cta) && !/FangSong|Serif SC/.test(idx.cta), JSON.stringify([idx.muted, idx.cta]));
  await shot("font-index");

  // timeline
  await nav("http://127.0.0.1:4173/timeline.html");
  const tl = await evalJs(`(() => ({ era: getComputedStyle(document.querySelector('.tl-era-name')).fontFamily, year: getComputedStyle(document.querySelector('.tl-year')).fontFamily, title: getComputedStyle(document.querySelector('.tl-title')).fontFamily, reign: getComputedStyle(document.querySelector('.tl-reign')).fontFamily, reignSize: getComputedStyle(document.querySelector('.tl-reign')).fontSize, ctx: getComputedStyle(document.querySelector('.tl-context-line')).fontFamily, tagSize: getComputedStyle(document.querySelector('.tl-tag')).fontSize }))()`);
  check("timeline: era/year/title serif, reign+ctx sans 13px, tags 13px", SERIF.test(tl.era) && SERIF.test(tl.year) && SERIF.test(tl.title) && SANS.test(tl.reign) && tl.reignSize === "13px" && SANS.test(tl.ctx) && tl.tagSize === "13px", JSON.stringify(tl));
  await shot("font-timeline");

  // qinli
  await nav("http://127.0.0.1:4173/qinli.html");
  const ql = await evalJs(`(() => ({ year: getComputedStyle(document.querySelector('.ql-year')).fontFamily, title: getComputedStyle(document.querySelector('.ql-title')).fontFamily, role: getComputedStyle(document.querySelector('.ql-role')).fontFamily, roleSize: getComputedStyle(document.querySelector('.ql-role')).fontSize, btn: getComputedStyle(document.querySelector('.ql-play-btn')).fontFamily }))()`);
  check("qinli: year/title serif, role/btn sans, role 13px", SERIF.test(ql.year) && SERIF.test(ql.title) && SANS.test(ql.role) && ql.roleSize === "13px" && SANS.test(ql.btn), JSON.stringify(ql));
  await evalJs(`document.querySelectorAll('.ql-card')[2].querySelector('.ql-play-btn').click()`);
  await sleep(500);
  const ql2 = await evalJs(`(() => ({ statLab: getComputedStyle(document.querySelector('.ql-stat-label')).fontFamily, statLabSize: getComputedStyle(document.querySelector('.ql-stat-label')).fontSize, statVal: getComputedStyle(document.querySelector('.ql-stat-val')).fontFamily, scene: getComputedStyle(document.querySelector('.ql-scene-label')).fontFamily, storyTitle: getComputedStyle(document.querySelector('.ql-story-title')).fontFamily, key: getComputedStyle(document.querySelector('.ql-key')).fontFamily }))()`);
  check("qinli play: story-title serif, stats/scene/key sans, label 13px", SERIF.test(ql2.storyTitle) && SANS.test(ql2.statLab) && ql2.statLabSize === "13px" && SANS.test(ql2.statVal) && SANS.test(ql2.scene) && SANS.test(ql2.key), JSON.stringify(ql2));
  await shot("font-qinli");

  // decisions entry strip sans
  await nav("http://127.0.0.1:4173/decisions.html");
  const dcEntry = await fontOf(".ql-entry-text");
  const dcNum = await fontOf(".dc-num");
  check("decisions: entry text sans, dc-num serif", SANS.test(dcEntry || "") && SERIF.test(dcNum || ""), JSON.stringify([dcEntry, dcNum]));

  // chat
  await nav("http://127.0.0.1:4173/chat.html");
  const ct = await evalJs(`(() => ({ name: getComputedStyle(document.querySelector('.ct-picker .ct-figure-name')).fontFamily, chip: getComputedStyle(document.querySelector('.ct-chip')).fontFamily, chipSize: getComputedStyle(document.querySelector('.ct-chip')).fontSize, end: document.querySelector('.ct-end-text') ? getComputedStyle(document.querySelector('.ct-end-text')).fontFamily : 'sans-check-later', note: document.querySelector('.ct-note') ? getComputedStyle(document.querySelector('.ct-note')).fontFamily : null }))()`);
  check("chat: figure-name serif, chips sans 13px", SERIF.test(ct.name) && SANS.test(ct.chip) && ct.chipSize === "13px", JSON.stringify(ct));
  await shot("font-chat");

  // search
  await nav("http://127.0.0.1:4173/search.html");
  await evalJs(`(() => { const i = document.querySelector('.sr-input'); i.value = '土木堡'; document.querySelector('.sr-form').dispatchEvent(new Event('submit', { cancelable: true })); })()`);
  await sleep(200);
  const sr = await evalJs(`(() => ({ book: getComputedStyle(document.querySelector('.sr-book-title')).fontFamily, input: getComputedStyle(document.querySelector('.sr-input')).fontFamily, btn: getComputedStyle(document.querySelector('.sr-btn')).fontFamily, hot: getComputedStyle(document.querySelector('.sr-hot-word')).fontFamily, sourceSize: getComputedStyle(document.querySelector('.sr-source')).fontSize, hotLabSize: getComputedStyle(document.querySelector('.sr-hot-label')).fontSize, levelSize: getComputedStyle(document.querySelector('.sr-book-level')).fontSize }))()`);
  check("search: book title serif, input/btn/hot sans, source+hotlabel 13px", SERIF.test(sr.book) && SANS.test(sr.input) && SANS.test(sr.btn) && SANS.test(sr.hot) && sr.sourceSize === "13px" && sr.hotLabSize === "13px", JSON.stringify(sr));
  await shot("font-search");

  // relations diagram: note clip + label overlap
  await nav("http://127.0.0.1:4173/relations.html");
  const pw = await evalJs(`(() => {
    const stage = document.querySelector('.pw-stage');
    const nodes = [...stage.querySelectorAll('.pw-node')].map(n => ({ cls: [...n.classList].find(c => c !== 'pw-node'), r: n.getBoundingClientRect(), noteBottom: n.querySelector('.pw-note') ? n.querySelector('.pw-note').getBoundingClientRect().bottom : null }));
    const clip = nodes.filter(n => n.noteBottom !== null && n.noteBottom > n.r.bottom - 1).map(n => [n.cls, Math.round(n.noteBottom - n.r.bottom)]);
    const labels = [...stage.querySelectorAll('.pw-wire-label text, .pw-wire-label-red text')].map(t => t.getBoundingClientRect());
    let worst = 0;
    labels.forEach(L => nodes.forEach(N => { const ox = Math.min(L.right, N.r.right) - Math.max(L.left, N.r.left); const oy = Math.min(L.bottom, N.r.bottom) - Math.max(L.top, N.r.top); if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy)); }));
    return { clip, worstOverlap: Math.round(worst * 10) / 10, noteSize: getComputedStyle(stage.querySelector('.pw-note')).fontSize, labelSize: getComputedStyle(stage.querySelector('.pw-wire-label text')).fontSize, labelFont: getComputedStyle(stage.querySelector('.pw-wire-label text')).fontFamily, redFont: getComputedStyle(stage.querySelector('.pw-wire-label-red text')).fontFamily, nameFont: getComputedStyle(stage.querySelector('.pw-name')).fontFamily };
  })()`);
  check("diagram: no note clipping, labels sans 13px, names serif", pw.clip.length === 0 && pw.noteSize === "13px" && pw.labelSize === "13px" && SANS.test(pw.labelFont) && SANS.test(pw.redFont) && SERIF.test(pw.nameFont), JSON.stringify(pw));
  check("diagram: label/box overlap <= 1px", pw.worstOverlap <= 1, pw.worstOverlap);
  await shot("font-relations-diagram");

  // mobile five pages
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  let mobOk = true; const mobBad = [];
  for (const p of ["index.html", "timeline.html", "qinli.html", "chat.html", "search.html"]) {
    await nav("http://127.0.0.1:4173/" + p);
    const w = await evalJs(`document.documentElement.scrollWidth`);
    const nh = await evalJs(`document.querySelector('.site-nav').offsetHeight`);
    if (w > 375 || nh > 60) { mobOk = false; mobBad.push([p, w, nh]); }
  }
  check("mobile five pages: no overflow, nav single row", mobOk, JSON.stringify(mobBad));
  await nav("http://127.0.0.1:4173/index.html");
  await shot("font-mobile-index");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });