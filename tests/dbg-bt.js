const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9289;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud45`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4173/browser-tests.html" });
  let title = "";
  for (let i = 0; i < 120; i++) { await sleep(1000); title = await ev("document.title"); if (/^(PASS|FAIL) /.test(title)) break; }
  const summary = await ev("(() => { const r = window.testResults || []; return { total: r.length, pass: r.filter(x => x.pass).length, fails: r.filter(x => !x.pass).map(x => x.name + ' : ' + x.error) }; })()");
  console.log("TITLE:", title);
  console.log(JSON.stringify(summary, null, 1));
  console.log(await ev("document.getElementById('results').textContent"));
  ws.close(); chrome.kill(); process.exit(summary.fails && summary.fails.length ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(1); });
