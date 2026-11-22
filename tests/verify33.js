const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9288;
const DIR = __dirname;
const MODE = process.argv[2] || "normal";
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud44`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const excs = []; const errs = []; const warns = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(2200); };
const clearStore = () => evalJs(`localStorage.clear(); true`);
const snap = () => evalJs(`(() => ({
  rows: document.querySelectorAll('.tl-event').length,
  tm: !!document.querySelector('.tm-section'),
  states: document.querySelectorAll('.tm-state').length,
  layers: document.querySelectorAll('.tm-layer').length,
  forts: document.querySelectorAll('.tm-fort').length,
  ctx: (document.querySelector('.tl-context-line') || {}).textContent || ''
}))()`);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") excs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled") {
      const text = d.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 300);
      if (d.params.type === "error") errs.push(text);
      if (d.params.type === "warning") warns.push(text);
    }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(600);

  // 1) plain entry
  await nav("http://127.0.0.1:8001/timeline.html");
  await clearStore();
  warns.length = 0; excs.length = 0; errs.length = 0;
  await nav("http://127.0.0.1:8001/timeline.html");
  let s = await snap();
  check(MODE + ": 23 timeline events", s.rows === 23, JSON.stringify(s));
  if (MODE === "normal") {
    check("normal: territory section present", s.tm === true, JSON.stringify(s));
    check("normal: six state buttons", s.states === 6, s.states);
    check("normal: eight overlay layers", s.layers === 8, s.layers);
    check("normal: fort markers rendered", s.forts > 0, s.forts);
    check("normal: context line non-empty", s.ctx.length > 0, s.ctx);
    check("normal: zero exceptions/errors/warnings", excs.length === 0 && errs.length === 0 && warns.length === 0, JSON.stringify({ excs, errs, warns }));
    check("normal: plain entry writes no progress", (await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`)) === null, "progress written");

    // 2) switch to 1420 state
    const sw = await evalJs(`(() => {
      const btns = [...document.querySelectorAll('.tm-state')];
      btns[1].click();
      const visible = [...document.querySelectorAll('.tm-layer')].filter(n => n.getAttribute('aria-hidden') === 'false').map(n => n.dataset.overlay).sort();
      const links = [...document.querySelectorAll('.tm-event-link')].map(a => a.getAttribute('href'));
      return { year: document.querySelector('.tm-year').textContent, pressed: btns.filter(b => b.getAttribute('aria-pressed') === 'true').length, visible, links };
    })()`);
    check("normal: 1420 state year+pressed", sw.year === "1420" && sw.pressed === 1, JSON.stringify(sw));
    check("normal: 1420 layers exact", JSON.stringify(sw.visible) === JSON.stringify(["jiaozhi", "jimi", "liaodong-full", "north-early", "nuergan"]), JSON.stringify(sw.visible));
    const expectedLinks = await evalJs(`SITE_DATA.timeline.events.filter(e => 1407 <= Number(e.year) && Number(e.year) <= 1448).map(e => 'timeline.html?event=' + e.id)`);
    check("normal: 1420 event links exact", JSON.stringify(sw.links) === JSON.stringify(expectedLinks), JSON.stringify({ sw: sw.links, expectedLinks }));
    check("normal: state switch writes no progress", (await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`)) === null, "progress written");

    // 3) deep link e1457
    await nav("http://127.0.0.1:8001/timeline.html?event=e1457");
    const deep = await evalJs(`(() => {
      const row = document.querySelector('.tl-event[data-id="e1457"]');
      return { detailHidden: row.querySelector('.tl-detail').hidden, expanded: row.querySelector('.tl-row').getAttribute('aria-expanded'), ctx: document.querySelector('.tl-context-line').textContent, read: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}').timeline.read };
    })()`);
    check("normal: deep link opens e1457", deep.detailHidden === false && deep.expanded === "true", JSON.stringify(deep));
    check("normal: era context shows 英宗", deep.ctx.includes("英宗"), deep.ctx);
    check("normal: deep link marks read", Array.isArray(deep.read) && deep.read.includes("e1457"), JSON.stringify(deep.read));

    // 4) 390px no overflow
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await nav("http://127.0.0.1:8001/timeline.html");
    const overflow = await evalJs(`document.documentElement.scrollWidth`);
    check("normal: 390px no horizontal overflow", overflow <= 390, overflow);
    await send("Emulation.clearDeviceMetricsOverride");
  } else {
    check("broken: territory section absent", s.tm === false, JSON.stringify(s));
    check("broken: context line still renders", s.ctx.length > 0, s.ctx);
    check("broken: exactly one expected warning", warns.length === 1 && warns[0].includes("版图数据缺失或结构不合法"), JSON.stringify(warns));
    check("broken: zero exceptions/errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }));
    warns.length = 0; excs.length = 0; errs.length = 0;
    await nav("http://127.0.0.1:8001/timeline.html?event=e1457");
    const deep = await evalJs(`(() => {
      const row = document.querySelector('.tl-event[data-id="e1457"]');
      return { detailHidden: row.querySelector('.tl-detail').hidden, expanded: row.querySelector('.tl-row').getAttribute('aria-expanded'), ctx: document.querySelector('.tl-context-line').textContent };
    })()`);
    check("broken: deep link still opens e1457", deep.detailHidden === false && deep.expanded === "true", JSON.stringify(deep));
    check("broken: era context still 英宗", deep.ctx.includes("英宗"), deep.ctx);
    check("broken: still only the one warning after deep link", warns.length === 1 && excs.length === 0 && errs.length === 0, JSON.stringify({ warns, excs, errs }));
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log("== " + MODE + " " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });