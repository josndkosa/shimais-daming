const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9306;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud62`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true }); if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 300) }; return r.result.value; };
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4173/search.html" }); await sleep(2200);
  console.log(JSON.stringify(await ev(`(() => {
    const i = document.querySelector('.sr-input');
    i.value = '徐达';
    document.querySelector('.sr-form').dispatchEvent(new Event('submit', { cancelable: true }));
    const cards = [...document.querySelectorAll('.sr-card')];
    return { input: !!i, form: !!document.querySelector('.sr-form'), cards: cards.length, sample: cards.slice(0, 3).map(c => ({ kind: c.querySelector('.sr-kind') ? c.querySelector('.sr-kind').textContent : null, text: c.textContent.slice(0, 40), href: c.getAttribute('href') })), resultsHTML: document.querySelector('.sr-results') ? document.querySelector('.sr-results').children.length : null };
  })()`), null, 1));
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(1); });
