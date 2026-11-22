const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9307;
const DIR = __dirname;
const BASE = "http://127.0.0.1:4173";
const PAGES = ["index.html", "timeline.html", "relations.html", "decisions.html", "qinli.html", "qinli-play.html?story=q1380", "cards.html", "search.html", "chat.html", "quiz.html", "profile.html", "chapter.html", "chapter.html?ch=jingnan"];
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud63`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const excs = []; const errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1900); };
const pageState = () => evalJs(`(() => {
  const de = document.documentElement;
  const cs = getComputedStyle(de);
  return { sbw: cs.scrollbarWidth, gutter: window.innerWidth - de.clientWidth, sw: de.scrollWidth, iw: window.innerWidth, sh: de.scrollHeight, ch: de.clientHeight };
})()`);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
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

  // desktop: every page hidden scrollbar + no h-overflow + wheel scroll works
  let allHidden = true, allNoOverflow = true, wheelOk = true; const detail = [];
  for (const p of PAGES) {
    await nav(BASE + "/" + p);
    const s = await pageState();
    if (s.sbw !== "none" || s.gutter !== 0) { allHidden = false; detail.push([p, "sb", s.sbw, s.gutter]); }
    if (s.sw > s.iw) { allNoOverflow = false; detail.push([p, "ov", s.sw, s.iw]); }
    if (s.sh > s.ch) {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: 400 });
      await sleep(500);
      const y = await evalJs("window.scrollY");
      if (!(y > 0)) { wheelOk = false; detail.push([p, "wheel", y]); }
      await evalJs("window.scrollTo(0, 0); true");
      await sleep(300);
    }
  }
  check("desktop: all 13 pages document scrollbar hidden (no gutter)", allHidden, JSON.stringify(detail));
  check("desktop: all 13 pages no horizontal overflow", allNoOverflow, JSON.stringify(detail));
  check("desktop: wheel scrolling still works on tall pages", wheelOk, JSON.stringify(detail));

  // desktop spot checks: carousel / relations / timeline
  await nav(BASE + "/index.html");
  const idx = await evalJs(`(() => { const c = document.querySelector('.carousel'); const r = c.getBoundingClientRect(); return { right: Math.round(r.right), iw: window.innerWidth, slides: document.querySelectorAll('.slide').length }; })()`);
  check("desktop index: carousel inside viewport", idx.right <= idx.iw && idx.slides >= 5, JSON.stringify(idx));
  await nav(BASE + "/relations.html");
  const rel = await evalJs(`(() => { const sc = document.querySelector('.rl-scroll'); const cs = getComputedStyle(sc); return { chartW: Math.round(document.querySelector('.rl-chart').getBoundingClientRect().width), innerOverflowX: cs.overflowX, docSb: getComputedStyle(document.documentElement).scrollbarWidth }; })()`);
  check("desktop relations: chart intact, internal scroll region untouched, doc hidden", rel.chartW >= 900 && rel.innerOverflowX === "auto" && rel.docSb === "none", JSON.stringify(rel));
  await nav(BASE + "/timeline.html");
  const tl = await evalJs(`(() => ({ rows: document.querySelectorAll('.tl-event').length, sw: document.documentElement.scrollWidth, iw: window.innerWidth }))()`);
  check("desktop timeline: 23 rows, no overflow", tl.rows === 23 && tl.sw <= tl.iw, JSON.stringify(tl));

  // 390px: every page no overflow
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  let mobOk = true; const mobDetail = [];
  for (const p of PAGES) {
    await nav(BASE + "/" + p);
    const s = await pageState();
    if (s.sw > 390 || s.gutter !== 0) { mobOk = false; mobDetail.push([p, s.sw, s.gutter]); }
  }
  check("390px: all 13 pages no overflow, scrollbar hidden", mobOk, JSON.stringify(mobDetail));
  // 390 spot checks
  await nav(BASE + "/index.html");
  const mIdx = await evalJs(`(() => { const c = document.querySelector('.carousel').getBoundingClientRect(); return { right: Math.round(c.right), nav: document.querySelector('.nav-links').scrollWidth > document.querySelector('.nav-links').clientWidth }; })()`);
  check("390px index: carousel fits, nav internal h-scroll kept", mIdx.right <= 390 && mIdx.nav, JSON.stringify(mIdx));
  await nav(BASE + "/relations.html");
  const mRel = await evalJs(`(() => { const sc = document.querySelector('.rl-scroll'); return { chartW: Math.round(document.querySelector('.rl-chart').getBoundingClientRect().width), hscroll: sc.scrollWidth > sc.clientWidth, nameW: Math.round(document.querySelector('.rl-name-cell').getBoundingClientRect().width) }; })()`);
  check("390px relations: chart in h-scroll container, name column 76", mRel.chartW >= 900 && mRel.hscroll && mRel.nameW === 76, JSON.stringify(mRel));
  await nav(BASE + "/chapter.html?ch=jingnan");
  const mCh = await evalJs(`(() => ({ secs: document.querySelectorAll('.ch-section').length, tabs: document.querySelectorAll('.ch-tab').length, sw: document.documentElement.scrollWidth }))()`);
  check("390px chapter: 5 sections, 8 tabs, no overflow", mCh.secs === 5 && mCh.tabs === 8 && mCh.sw <= 390, JSON.stringify(mCh));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify44 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(1); });