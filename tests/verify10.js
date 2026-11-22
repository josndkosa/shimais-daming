const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9250;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud12`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const activeIdx = () => evalJs(`[...document.querySelectorAll('.slide')].findIndex(n => n.classList.contains('is-active'))`);
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const GEO = `(() => {
  const nav = document.querySelector('.site-nav');
  const car = document.querySelector('.carousel');
  const head = document.querySelector('.page-head');
  const nb = nav.getBoundingClientRect().bottom;
  const g = { navBottom: nb, hasHead: !!head, overflow: document.documentElement.scrollWidth - window.innerWidth };
  if (car) {
    const cr = car.getBoundingClientRect();
    const next = car.nextElementSibling;
    g.carTop = cr.top; g.carH = cr.height; g.winH = window.innerHeight;
    g.first = document.getElementById('app').firstElementChild === car;
    g.gapNext = next ? next.getBoundingClientRect().top - cr.bottom : null;
    g.nextPad = next ? parseFloat(getComputedStyle(next).paddingTop) : null;
  }
  if (head) { const hr = head.getBoundingClientRect(); g.headTop = hr.top; g.headH = hr.height; g.headTitle = head.querySelector('.head-title').textContent; }
  return g;
})()`;
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

  // ---- 桌面首页 ----
  await nav("http://127.0.0.1:4173/index.html");
  const g = await evalJs(GEO);
  check("index desktop: no page-head, carousel is first block", !g.hasHead && g.first, JSON.stringify(g));
  check("index desktop: carousel flush under nav, full height minus nav only", Math.abs(g.carTop - g.navBottom) <= 1 && Math.abs(g.carH - (g.winH - g.navBottom)) <= 2, JSON.stringify([g.carTop, g.navBottom, g.carH, g.winH]));
  check("index desktop: no leftover head-band gap before next section", g.gapNext !== null && g.gapNext <= 1, JSON.stringify([g.gapNext, g.nextPad]));
  await shot("index-desktop-nohead");
  const i0 = await activeIdx();
  await sleep(5600);
  const i1 = await activeIdx();
  check("index autoplay still 0 -> 1", i0 === 0 && i1 === 1, i0 + "->" + i1);
  await evalJs(`document.querySelectorAll('.car-dot')[1].click()`);
  await sleep(900);
  const tz = await evalJs(`(() => { const c = document.querySelector('.carousel').getBoundingClientRect(); const f = document.querySelector('.slide-frame.is-active .frame-wrap').getBoundingClientRect(); return { top: f.top, bottom: f.bottom, cTop: c.top, cBottom: c.bottom }; })()`);
  check("taizu frame fits inside taller carousel", tz.top >= tz.cTop - 1 && tz.bottom <= tz.cBottom + 1, JSON.stringify(tz));
  await shot("index-taizu-nohead");

  // ---- 桌面内页页眉带保持 ----
  const inner = [["timeline.html", "时间线"], ["decisions.html", "决策模式"], ["cards.html", "人物与制度卡"], ["quiz.html", "小测"], ["profile.html", "我的研读画像"]];
  let deskOk = true; const deskDetail = [];
  for (const [file, title] of inner) {
    await nav("http://127.0.0.1:4173/" + file);
    const q = await evalJs(GEO);
    deskDetail.push([file, q.hasHead, q.headH, q.headTitle]);
    if (!q.hasHead || Math.abs(q.headH - 88) > 1 || Math.abs(q.headTop - q.navBottom) > 1 || q.headTitle !== title) deskOk = false;
  }
  check("5 inner pages keep 88px page-head flush under nav", deskOk, JSON.stringify(deskDetail));
  await nav("http://127.0.0.1:4173/timeline.html");
  await shot("timeline-head-kept");

  // ---- 移动端 ----
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/index.html");
  const mg = await evalJs(GEO);
  check("index mobile: no head, flush under wrapped nav, full height, no overflow", !mg.hasHead && mg.first && Math.abs(mg.carTop - mg.navBottom) <= 1 && Math.abs(mg.carH - (mg.winH - mg.navBottom)) <= 2 && mg.overflow <= 0, JSON.stringify(mg));
  await shot("index-mobile-nohead");
  let mobOk = true; const mobDetail = [];
  for (const [file, title] of inner) {
    await nav("http://127.0.0.1:4173/" + file);
    const q = await evalJs(GEO);
    mobDetail.push([file, q.hasHead, q.headH]);
    if (!q.hasHead || Math.abs(q.headH - 72) > 1 || Math.abs(q.headTop - q.navBottom) > 1 || q.headTitle !== title || q.overflow > 0) mobOk = false;
  }
  check("5 inner pages mobile keep 72px page-head, no overflow", mobOk, JSON.stringify(mobDetail));

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });