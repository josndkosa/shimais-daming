const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9283;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud45`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); } };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4173/decisions.html" });
  await sleep(1200);
  await evalJs(`(() => { const s = document.querySelectorAll('.dc-scenario')[1]; if (s) { const b = s.querySelectorAll('.dc-choice')[0]; if (b) b.click(); } })()`);
  await sleep(500);
  console.log("after answering scenario 2:", JSON.stringify(await evalJs(`({ choices: document.querySelectorAll('.dc-scenario')[1].querySelectorAll('.dc-choice').length, locked: [...document.querySelectorAll('.dc-scenario')[1].querySelectorAll('.dc-choice')].map(b=>b.disabled) })`)));
  await send("Page.navigate", { url: "http://127.0.0.1:8001/profile.html" });
  await sleep(1500);
  console.log("profile stats:", JSON.stringify(await evalJs(`[...document.querySelectorAll('.pf-stat-title')].map(x=>x.textContent)`)));
  console.log("pf-counts:", JSON.stringify(await evalJs(`[...document.querySelectorAll('.pf-count')].map(x=>x.textContent)`)));
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(2); });
