const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9284;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud46`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-practice.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") errs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 400)); };
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(600);
  await send("Page.navigate", { url: "http://127.0.0.1:8001/profile.html" });
  await sleep(1500);
  console.log("no-state:", JSON.stringify(await evalJs(`({ stats: [...document.querySelectorAll('.pf-stat-title')].map(x=>x.textContent), old: !!document.querySelector('.pf-old-list') })`)));
  await evalJs(`(() => { const picks = SITE_DATA.quiz.map(q=>q.answer); localStorage.setItem('shimais-daming:progress:v1', JSON.stringify({ quiz: { picks, score: 10, dims: { timeline:{hit:4,total:4}, person:{hit:3,total:3}, institution:{hit:3,total:3} } } })); localStorage.setItem('shimais-daming:chatmem:v1', JSON.stringify({ zhuyuanzhang: { history: [], totalRounds: 7, lastTopics: ['问过废相'], lastVisit: Date.now() } })); })()`);
  await send("Page.navigate", { url: "http://127.0.0.1:8001/profile.html" });
  await sleep(1500);
  console.log("with-state:", JSON.stringify(await evalJs(`({ stats: [...document.querySelectorAll('.pf-stat-title')].map(x=>x.textContent), counts: [...document.querySelectorAll('.pf-count')].map(x=>x.textContent), old: [...document.querySelectorAll('.pf-old-row')].map(x=>x.textContent) })`)));
  console.log("ERRS", JSON.stringify(errs));
  ws.close(); chrome.kill(); stub.kill(); process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); stub.kill(); process.exit(2); });
