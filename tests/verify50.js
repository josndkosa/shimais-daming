const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9314; const DIR = __dirname;
const URL = "http://127.0.0.1:4173/timeline.html";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud51`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
const results = [];
const check = (n, ok, x) => { results.push({ n, ok }); console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + x)); };
const nav = async (u) => { await send("Page.navigate", { url: u }); await sleep(1200); };
const shot = async (n) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + n + ".png", Buffer.from(s.data, "base64")); };
const terr = () => ev(`(() => ({ year: document.querySelector('.tm-year').textContent, label: document.querySelector('.tm-label').textContent, note: document.querySelector('.tm-link-note').textContent, noteHidden: document.querySelector('.tm-link-note').hidden, states: document.querySelectorAll('.tm-state').length, all: document.querySelectorAll('.tm-state-all').length, scrollY: window.scrollY }))()`);
const hl = () => ev(`(() => ({ linked: [...document.querySelectorAll('.tl-event.tl-linked')].map(n => n.dataset.id), dimmed: [...document.querySelectorAll('.tl-event.tl-dimmed')].map(n => n.dataset.id), total: document.querySelectorAll('.tl-event').length }))()`);
const openEv = (id) => ev(`(() => { const a = document.querySelector('.tl-event[data-id="${id}"]'); if (!a) return false; a.querySelector('.tl-row').click(); return true; })()`);
const manual = (i) => ev(`document.querySelectorAll('.tm-state')[${i}].click()`);
const clickAll = () => ev(`document.querySelector('.tm-state-all').click()`);
const ranges = () => ev(`SITE_DATA.territory.states.map(s => ({ id: s.id, range: s.range, label: s.label }))`);
const evYears = () => ev(`SITE_DATA.timeline.events.map(e => ({ id: e.id, y: Number(e.year) }))`);

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
  await nav(URL);
  await ev(`localStorage.clear()`);
  await nav(URL);

  const R = await ranges(); const Y = await evYears();
  let st = await terr(); let h = await hl();
  check("default: 1368 state, note hidden, no highlight, 6 states + 全部", st.year === "1368" && st.noteHidden && st.states === 6 && st.all === 1 && h.linked.length === 0 && h.dimmed.length === 0 && h.total === 23, JSON.stringify([st, h]));

  // event -> territory silent
  const y0 = st.scrollY;
  await openEv("e1449"); await sleep(200);
  st = await terr(); h = await hl();
  check("open 1449: territory 1450 土木堡之后 + event note, no scroll, no reverse highlight", st.year === "1450" && st.label === "土木堡之后" && st.note === "已随事件年份切换至 土木堡之后" && !st.noteHidden && st.scrollY === y0 && h.linked.length === 0 && h.dimmed.length === 0, JSON.stringify([st, h]));
  await openEv("e1619"); await sleep(200);
  st = await terr();
  check("open 1619: territory 1620 萨尔浒之后 + note", st.year === "1620" && st.label === "萨尔浒之后" && st.note === "已随事件年份切换至 萨尔浒之后", JSON.stringify(st));

  // manual -> highlight
  await manual(1); await sleep(200);
  st = await terr(); h = await hl();
  const s1420 = R[1];
  const wantLinked = Y.filter(e => e.y >= s1420.range[0] && e.y <= s1420.range[1]).map(e => e.id);
  const wantDimmed = Y.filter(e => !(e.y >= s1420.range[0] && e.y <= s1420.range[1])).map(e => e.id);
  check("manual 1420: in-range linked, others dimmed, manual note", JSON.stringify(h.linked.slice().sort()) === JSON.stringify(wantLinked.slice().sort()) && JSON.stringify(h.dimmed.slice().sort()) === JSON.stringify(wantDimmed.slice().sort()) && st.note === "正显示 交趾在版图 时段的事件" && !st.noteHidden, JSON.stringify([h.linked, wantLinked, st.note]));
  await shot("bd-highlight");
  // same state again restores
  await manual(1); await sleep(200);
  h = await hl(); st = await terr();
  check("same state again: styles restored, note hidden", h.linked.length === 0 && h.dimmed.length === 0 && st.noteHidden, JSON.stringify([h, st.noteHidden]));
  // 全部 restores
  await manual(1); await sleep(150); await clickAll(); await sleep(200);
  h = await hl(); st = await terr();
  check("全部: styles restored, note hidden", h.linked.length === 0 && h.dimmed.length === 0 && st.noteHidden, JSON.stringify(h));

  // rapid consecutive events -> last wins
  await openEv("e1380"); await openEv("e1449"); await openEv("e1619"); await openEv("e1644"); await sleep(250);
  st = await terr();
  check("rapid clicks: territory ends at last event state 1644 落幕", st.year === "1644" && st.label === "落幕" && st.note === "已随事件年份切换至 落幕", JSON.stringify(st));

  // manual highlight still independent after event follow (no loop): manual 1450 then open event in other state keeps highlight governed by manual
  await manual(2); await sleep(150);
  h = await hl();
  const s1450 = R[2];
  const wl2 = Y.filter(e => e.y >= s1450.range[0] && e.y <= s1450.range[1]).map(e => e.id);
  check("manual 1450 highlights its range", JSON.stringify(h.linked.slice().sort()) === JSON.stringify(wl2.slice().sort()), JSON.stringify([h.linked, wl2]));
  await clickAll(); await sleep(150);

  // mobile 390
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav(URL);
  let mob = await ev(`(() => ({ docW: document.documentElement.scrollWidth }))()`);
  await openEv("e1449"); await sleep(200);
  st = await terr();
  await manual(1); await sleep(200);
  h = await hl();
  mob = await ev(`(() => ({ docW: document.documentElement.scrollWidth }))()`);
  check("mobile 390: linkage + highlight work, no h-overflow", mob.docW <= 390 && st.year === "1450" && h.linked.length > 0 && h.dimmed.length > 0, JSON.stringify([mob, st.year, h.linked.length]));
  await shot("bd-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });