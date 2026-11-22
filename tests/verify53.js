const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9318; const DIR = __dirname;
const BASE = "http://127.0.0.1:4173/";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud55`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
const results = [];
const check = (n, ok, x) => { results.push({ n, ok }); console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + x)); };
const nav = async (u) => { await send("Page.navigate", { url: BASE + u }); await sleep(1100); };
const shot = async (n) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + n + ".png", Buffer.from(s.data, "base64")); };
const X = () => ev(`window.innerWidth - 2`);
const barState = () => ev(`(() => { const b = document.getElementById('side-scroll'); if (!b) return { present: false }; const t = b.querySelector('.side-scroll-thumb'); const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); const doc = document.documentElement; return { present: true, hidden: b.hidden, width: cs.width, z: cs.zIndex, right: r.right, left: r.left, innerW: window.innerWidth, trackH: b.clientHeight, thumbH: t ? t.offsetHeight : 0, thumbTop: t ? t.offsetTop : 0, docH: doc.scrollHeight, viewH: window.innerHeight, scrollY: window.scrollY, opacity: t ? getComputedStyle(t).opacity : null, oldLeft: !!document.getElementById('left-scroll') }; })()`);
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
async function dragThumbMouse(toY) {
  const s = await barState(); const x = await X();
  const startY = s.thumbTop + 5;
  await mouse("mousePressed", x, startY);
  for (let y = startY; y <= toY; y += 60) { await mouse("mouseMoved", x, y); await sleep(30); }
  await mouse("mouseMoved", x, toY); await sleep(60);
  await mouse("mouseReleased", x, toY); await sleep(120);
}
async function dragThumbTouch(toY) {
  const s = await barState(); const x = await X();
  const startY = s.thumbTop + 5;
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
  for (let y = startY; y <= toY; y += 60) { await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] }); await sleep(30); }
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: toY }] }); await sleep(60);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(120);
}

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
  await nav("timeline.html"); await ev(`localStorage.clear()`);

  const pages = ["index.html", "timeline.html", "decisions.html", "cards.html", "search.html", "chapter.html", "quiz.html", "profile.html", "relations.html", "chat.html", "qinli.html", "qinli-play.html?story=q1449"];
  let allRight = true, hiddenLogic = true, noLeft = true, detail = [];
  for (const p of pages) {
    await nav(p);
    const s = await barState();
    const scrollable = s.docH > s.viewH + 1;
    const atRight = s.present && Math.abs(s.right - s.innerW) <= 1 && Math.abs(s.left - (s.innerW - parseFloat(s.width))) <= 1;
    if (!atRight) allRight = false;
    if (s.hidden !== !scrollable) hiddenLogic = false;
    if (s.oldLeft) noLeft = false;
    const leftHit = await ev(`(() => { const e = document.elementFromPoint(2, Math.round(window.innerHeight / 2)); return e ? (e.id || e.className || e.tagName) : null; })()`);
    if (String(leftHit).includes("side-scroll")) noLeft = false;
    detail.push([p, atRight, s.hidden, scrollable]);
  }
  check("all 12 formal pages: bar pinned to RIGHT edge", allRight, JSON.stringify(detail));
  check("no bar at left edge on any page", noLeft, JSON.stringify(detail));
  check("bar hidden exactly when page not scrollable", hiddenLogic, JSON.stringify(detail));

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 6000, deviceScaleFactor: 1, mobile: false });
  await nav("quiz.html");
  let s = await barState();
  check("short page (tall viewport) hides bar", s.present && s.hidden === true && s.docH <= s.viewH + 1, JSON.stringify([s.hidden, s.docH, s.viewH]));
  await send("Emulation.clearDeviceMetricsOverride");
  await nav("timeline.html");

  s = await barState();
  const expectH = Math.max(40, Math.round((s.viewH / s.docH) * s.trackH));
  check("thumb height formula, width 5, z 50 unchanged", Math.abs(s.thumbH - expectH) <= 1 && s.width === "5px" && s.z === "50", JSON.stringify([s.thumbH, expectH, s.width, s.z]));
  await ev(`window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`); await sleep(200);
  s = await barState();
  check("scroll to bottom: thumb at track bottom", Math.abs(s.thumbTop - (s.trackH - s.thumbH)) <= 2, JSON.stringify([s.thumbTop, s.trackH - s.thumbH]));
  await ev(`window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * 0.4, behavior: 'instant' })`); await sleep(200);
  await dragThumbMouse(s.trackH - 5);
  let after = await ev(`window.scrollY`); let max = await ev(`document.documentElement.scrollHeight - window.innerHeight`);
  check("mouse drag thumb (right edge) to bottom", Math.abs(after - max) <= 3, JSON.stringify([after, max]));
  await dragThumbMouse(5);
  after = await ev(`window.scrollY`);
  check("mouse drag thumb to top", after <= 3, JSON.stringify(after));

  s = await barState(); const x = await X();
  await mouse("mousePressed", x, Math.round(s.trackH / 2)); await mouse("mouseReleased", x, Math.round(s.trackH / 2)); await sleep(150);
  after = await ev(`window.scrollY`); max = await ev(`document.documentElement.scrollHeight - window.innerHeight`);
  check("track click (right edge) jumps proportionally", after > max * 0.3 && after < max * 0.7, JSON.stringify([after, max]));

  await ev(`window.scrollTo({ top: 0, behavior: 'instant' })`); await sleep(150);
  await mouse("mouseMoved", x, 100); await sleep(150);
  s = await barState();
  check("hover brightens thumb", parseFloat(s.opacity) > 0.6, JSON.stringify(s.opacity));
  await mouse("mouseMoved", 400, 400); await sleep(150);

  // mobile 390
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("timeline.html");
  await ev(`window.scrollTo({ top: (document.documentElement.scrollHeight - window.innerHeight) * 0.4, behavior: 'instant' })`); await sleep(200);
  s = await barState();
  check("390px bar width 4 at right", s.width === "4px" && Math.abs(s.right - s.innerW) <= 1, JSON.stringify([s.width, s.right, s.innerW]));
  await dragThumbTouch(s.trackH - 5);
  after = await ev(`window.scrollY`); max = await ev(`document.documentElement.scrollHeight - window.innerHeight`);
  check("touch drag (right edge) to bottom", Math.abs(after - max) <= 4, JSON.stringify([after, max]));
  await dragThumbTouch(5);
  after = await ev(`window.scrollY`);
  check("touch drag back to top", after <= 4, JSON.stringify(after));

  // menu (nav links) clickable at right edge above bar; content right clear of bar
  const navClick = await ev(`(() => { const links = [...document.querySelectorAll('.nav-links a')]; const last = links[links.length - 1]; const r = last.getBoundingClientRect(); const cx = Math.min(r.right - 2, window.innerWidth - 2); const cy = r.top + r.height / 2; const hit = document.elementFromPoint(cx, cy); return { hitInNav: !!(hit && hit.closest('.site-nav')), hitIsBar: !!(hit && hit.closest('#side-scroll')), href: last.getAttribute('href') }; })()`);
  check("390px right-edge nav menu item clickable above bar", navClick.hitInNav && !navClick.hitIsBar, JSON.stringify(navClick));
  for (const p of ["relations.html", "chapter.html", "qinli-play.html?story=q1449"]) {
    await nav(p);
    const r = await ev(`(() => { const b = document.getElementById('side-scroll'); const bw = b.getBoundingClientRect().width; const label = document.querySelector('.rl-name-cell') || document.querySelector('.ch-read') || document.querySelector('.qp-title'); const lr = label ? label.getBoundingClientRect().right : 0; return { bw, contentRight: lr, innerW: window.innerWidth, docW: document.documentElement.scrollWidth }; })()`);
    check("390px " + p + ": content right clear of bar, no h-overflow", r.contentRight <= r.innerW - r.bw && r.docW <= 390, JSON.stringify(r));
  }
  await shot("bh2-mobile-play");

  // z-order popup above bar at right edge
  await nav("relations.html");
  await ev(`document.querySelector('.rl-bar').click()`); await sleep(200);
  const z = await ev(`(() => { const e = document.elementFromPoint(window.innerWidth - 2, Math.round(window.innerHeight / 2)); return { hit: e ? (e.className || e.tagName) : null, overlay: getComputedStyle(document.querySelector('.rl-overlay')).zIndex, bar: getComputedStyle(document.getElementById('side-scroll')).zIndex, nav: getComputedStyle(document.querySelector('.site-nav')).zIndex }; })()`);
  check("popup(80)/nav(60) above bar(50); overlay covers right-edge point", Number(z.overlay) > Number(z.bar) && Number(z.nav) > Number(z.bar) && String(z.hit).includes("rl-overlay"), JSON.stringify(z));
  await ev(`document.querySelector('.rl-close').click()`);
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });