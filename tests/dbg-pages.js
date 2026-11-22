const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9282;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud44`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") errs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 250)); };
  await send("Runtime.enable"); await send("Page.enable");
  for (const p of ["decisions.html", "profile.html"]) {
    await send("Page.navigate", { url: "http://127.0.0.1:4173/" + p });
    await sleep(1400);
    console.log(p, JSON.stringify(await evalJs(`({ dc: document.querySelectorAll('.dc-scenario').length, dcChoices: document.querySelectorAll('.dc-choice').length, pfStats: [...document.querySelectorAll('.pf-stat-title')].map(x=>x.textContent), pfOld: !!document.querySelector('.pf-old-list') })`)));
  }
  console.log("ERRS", JSON.stringify(errs));
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(2); });
