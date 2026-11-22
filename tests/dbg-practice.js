const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9274;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud36`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-practice.js"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); } else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push(d.params.args.map(a => a.value || a.description).join(" ")); };
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(600);
  await send("Page.navigate", { url: "http://127.0.0.1:4173/quiz.html" });
  await sleep(1200);
  await evalJs(`document.querySelectorAll('.qz-mode')[1].click()`);
  await sleep(300);
  await evalJs(`document.querySelector('.qz-gen-btn').click()`);
  await sleep(1500);
  console.log(JSON.stringify(await evalJs(`(() => ({ panel: document.querySelector('.qz-practice-panel').textContent, items: document.querySelectorAll('.qz-practice-list .qz-item').length, listKids: document.querySelector('.qz-practice-list').children.length, api: document.querySelector('meta[name="api-base"]') ? document.querySelector('meta[name="api-base"]').content : null }))()`), null, 1));
  console.log("ERRS", JSON.stringify(errs));
  ws.close(); chrome.kill(); stub.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); stub.kill(); process.exit(2); });
