const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9248;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud10`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) { const r = await send("Runtime.evaluate", { expression, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4173/index.html" }); await sleep(1500);
  await evalJs(`window.__vis = []; document.addEventListener('visibilitychange', () => window.__vis.push(document.visibilityState));`);
  const idx = () => evalJs(`[...document.querySelectorAll('.slide')].findIndex(n => n.classList.contains('is-active'))`);
  console.log("initial", await evalJs(`document.visibilityState`), await idx());
  await send("Page.setWebLifecycleState", { state: "frozen" }); await sleep(1000);
  console.log("frozen:", await evalJs(`document.visibilityState`), "events:", await evalJs(`JSON.stringify(window.__vis)`));
  await sleep(6500);
  console.log("after 6.5s frozen, idx:", await idx());
  await send("Page.setWebLifecycleState", { state: "active" }); await sleep(1000);
  console.log("active:", await evalJs(`document.visibilityState`), "events:", await evalJs(`JSON.stringify(window.__vis)`));
  await sleep(6500);
  console.log("after 6.5s active, idx:", await idx());
  // 备用方案：直接派发 visibilitychange 事件验证处理器
  await evalJs(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));`);
  const a = await idx(); await sleep(6500); const b = await idx();
  console.log("simulated hidden: no advance?", a === b, a, b);
  await evalJs(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'));`);
  await sleep(6500); const c = await idx();
  console.log("simulated visible: advances?", c === (b + 1) % 5, b, c);
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });