const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:4173/";
const OUT = path.join(os.tmpdir(), "shimais-check2");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = { errors: [], checks: [] };
function check(name, ok, extra) {
  R.checks.push({ name, ok: !!ok, extra });
  if (!ok) console.log("CHECK_FAIL", name, JSON.stringify(extra || {}));
}

(async () => {
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9230", `--user-data-dir=${path.join(OUT, "profile")}`, "about:blank"], { stdio: "ignore" });
  let ws;
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch("http://127.0.0.1:9230/json/version"); if (r.ok) break; } catch {} await sleep(250); }
    const tab = await (await fetch("http://127.0.0.1:9230/json/new?about:blank", { method: "PUT" })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res) => (ws.onopen = res));
    let id = 0; const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
      else if (m.method === "Runtime.exceptionThrown") R.errors.push("exception: " + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params));
      else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") R.errors.push("console: " + m.params.args.map(a => a.value || a.description).join(" "));
    };
    const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
    const ev = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const goto = async (url) => { await send("Page.navigate", { url }); await sleep(900); };
    const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(s.data, "base64")); };
    const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    const metrics = (w, h, mobile) => send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    const overflow = () => ev(`document.documentElement.scrollWidth > window.innerWidth ? [document.documentElement.scrollWidth, window.innerWidth] : null`);
    const activeIdx = () => ev(`[...document.querySelectorAll('.slide')].findIndex(s => s.classList.contains('is-active'))`);

    await send("Page.enable");
    await send("Runtime.enable");

    /* ---------- desktop index ---------- */
    await metrics(1280, 900, false);
    await goto(BASE);
    await ev(`localStorage.clear()`);
    check("index: nav links", await ev(`document.querySelectorAll('.nav-link').length`) === 5);
    check("index: brand", await ev(`document.querySelector('.nav-brand').textContent`) === "史脉·大明");
    const carH = await ev(`Math.round(document.querySelector('.carousel').getBoundingClientRect().height)`);
    check("index: carousel fills first screen", Math.abs(carH - (900 - 56 - 88)) <= 2, { carH });
    check("index: 5 slides", await ev(`document.querySelectorAll('.slide').length`) === 5);
    check("index: slide0 active", (await activeIdx()) === 0);
    check("index: no h-overflow", (await overflow()) === null);
    await shot("d-index-slide0");

    await sleep(6600);
    check("carousel: autoplay advanced", (await activeIdx()) === 1, { idx: await activeIdx() });

    await mouse(640, 400);
    const hoverIdx = await activeIdx();
    await sleep(7000);
    check("carousel: hover pauses", (await activeIdx()) === hoverIdx);
    await ev(`window.scrollTo({top:400,behavior:'instant'})`);
    await mouse(640, 860);
    await ev(`document.activeElement && document.activeElement.blur()`);
    await sleep(6800);
    check("carousel: resumes after leave", (await activeIdx()) !== hoverIdx);
    await ev(`window.scrollTo({top:0,behavior:'instant'})`);
    await sleep(300);

    await ev(`document.querySelector('.car-next').click()`);
    const afterNext = await activeIdx();
    await ev(`document.querySelectorAll('.car-dot')[0].click()`);
    check("carousel: dot jump", (await activeIdx()) === 0);
    await ev(`document.querySelectorAll('.car-dot')[1].click()`);
    check("carousel: arrow+dot manual", afterNext !== 1 && (await activeIdx()) === 1);
    const frame = await ev(`(() => { const img = document.querySelector('.slide-frame img'); const r = img.getBoundingClientRect(); const f = document.querySelector('.slide-frame .frame-wrap').getBoundingClientRect(); const hn = document.querySelector('.slide.is-active .slide-headline'); const rg = document.createRange(); rg.selectNodeContents(hn); const h = rg.getBoundingClientRect(); const overlap = !(h.right < f.left || h.left > f.right || h.bottom < f.top || h.top > f.bottom); return { w: Math.round(r.width), h: Math.round(r.height), ratio: +(r.width / r.height).toFixed(3), natural: +(img.naturalWidth / img.naturalHeight).toFixed(3), vw: window.innerWidth, overlap }; })()`);
    check("taizu: portrait not stretched", Math.abs(frame.ratio - frame.natural) < 0.02 && frame.w < frame.vw * 0.8, frame);
    check("taizu: no copy overlap (desktop)", !frame.overlap, frame);
    await sleep(700);
    await shot("d-index-taizu");
    check("index: question", await ev(`document.querySelector('.main-question').textContent.includes("为什么最后失控了")`));
    check("index: entries hrefs", await ev(`JSON.stringify([...document.querySelectorAll('.entry-block')].map(a => a.getAttribute('href')))`) === JSON.stringify(["timeline.html", "decisions.html", "cards.html", "quiz.html", "profile.html"]));
    check("index: footer", await ev(`document.querySelector('.footer-series').textContent`) === "史脉系列 · 第一季：大明");

    /* ---------- timeline desktop + progress persistence ---------- */
    await goto(BASE + "timeline.html");
    check("timeline: current nav", await ev(`document.querySelector('.nav-link.is-current').getAttribute('href')`) === "timeline.html");
    check("timeline: 21 events", await ev(`document.querySelectorAll('.tl-event').length`) === 21);
    check("timeline: progress 0", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 0 / 21");
    await ev(`document.querySelector('.tl-event[data-id="e1368"] .tl-row').click()`);
    check("timeline: expand opens", await ev(`!document.querySelector('.tl-event[data-id="e1368"] .tl-detail').hidden`));
    check("timeline: read marked", await ev(`document.querySelector('.tl-event[data-id="e1368"]').classList.contains('is-read')`));
    check("timeline: progress 1", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 1 / 21");
    await ev(`document.querySelector('.tl-event[data-id="e1368"] .tl-row').click()`);
    check("timeline: collapse", await ev(`document.querySelector('.tl-event[data-id="e1368"] .tl-detail').hidden`));
    check("timeline: read persists after collapse", await ev(`document.querySelector('.tl-event[data-id="e1368"]').classList.contains('is-read')`));
    await ev(`document.querySelector('.tl-event[data-id="e1368"] .tl-row').click()`);
    await sleep(400);
    await shot("d-timeline");

    await goto(BASE);
    check("progress: shared on index", await ev(`JSON.parse(localStorage.getItem('shimais-daming:progress:v1')).timeline.read.length`) === 1);
    await goto(BASE + "timeline.html");
    check("progress: survives navigation", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 1 / 21");
    await ev(`document.querySelector('.tl-event[data-id="e1380"] .tl-row').click()`);
    check("timeline: second read", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 2 / 21");

    /* ---------- other pages desktop ---------- */
    for (const p of ["decisions.html", "cards.html", "quiz.html", "profile.html"]) {
      await goto(BASE + p);
      check(p + ": nav current", await ev(`document.querySelector('.nav-link.is-current').getAttribute('href')`) === p);
      check(p + ": head title", await ev(`document.querySelector('.head-title').textContent.length > 0`));
      check(p + ": placeholder", await ev(`!!document.querySelector('.placeholder-box')`));
      check(p + ": no h-overflow", (await overflow()) === null);
      check(p + ": progress intact", await ev(`JSON.parse(localStorage.getItem('shimais-daming:progress:v1')).timeline.read.length`) === 2);
    }
    await goto(BASE + "timeline.html");
    check("progress: back to timeline 2", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 2 / 21");

    /* ---------- mobile ---------- */
    await metrics(375, 812, true);
    await goto(BASE);
    check("m-index: no h-overflow", (await overflow()) === null);
    check("m-index: short nav", await ev(`getComputedStyle(document.querySelector('.nav-short')).display`) !== "none");
    const mCarH = await ev(`Math.round(document.querySelector('.carousel').getBoundingClientRect().height)`);
    check("m-index: carousel height", Math.abs(mCarH - (812 - 56 - 72)) <= 2, { mCarH });
    const beforeSwipe = await activeIdx();
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 300, y: 400 }] });
    await sleep(60);
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 402 }] });
    await sleep(60);
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 90, y: 404 }] });
    await sleep(60);
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(500);
    check("m-carousel: swipe next", (await activeIdx()) === (beforeSwipe + 1) % 5, { beforeSwipe, after: await activeIdx() });
    const mFrame = await ev(`(() => { const f = document.querySelector('.slide-frame .frame-wrap').getBoundingClientRect(); const hn = document.querySelector('.slide.is-active .slide-headline'); const rg = document.createRange(); rg.selectNodeContents(hn); const h = rg.getBoundingClientRect(); return !(h.right < f.left || h.left > f.right || h.bottom < f.top || h.top > f.bottom); })()`);
    check("m-taizu: no copy overlap", !mFrame);
    await shot("m-index");

    await goto(BASE + "timeline.html");
    check("m-timeline: no h-overflow", (await overflow()) === null);
    check("m-timeline: progress shared", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 2 / 21");
    await ev(`document.querySelector('.tl-event[data-id="e1449"] .tl-row').click()`);
    check("m-timeline: expand works", await ev(`!document.querySelector('.tl-event[data-id="e1449"] .tl-detail').hidden`));
    check("m-timeline: progress 3", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 3 / 21");
    check("m-timeline: no overflow after expand", (await overflow()) === null);
    await ev(`document.querySelector('.tl-event[data-id="e1449"]').scrollIntoView({block:'center'})`);
    await sleep(400);
    await shot("m-timeline");

    for (const p of ["decisions.html", "cards.html", "quiz.html", "profile.html"]) {
      await goto(BASE + p);
      check("m-" + p + ": no h-overflow", (await overflow()) === null);
    }
    await goto(BASE + "timeline.html");
    check("m-progress: final 3", await ev(`document.querySelector('.tl-progress-label').textContent`) === "已读 3 / 21");

    check("no runtime/console errors", R.errors.length === 0, R.errors);
    ws.close();
  } finally { chrome.kill(); }
  const failed = R.checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ total: R.checks.length, failed: failed.length, errors: R.errors }, null, 2));
  console.log("SHOTS=" + OUT);
  process.exit(failed.length ? 2 : 0);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });