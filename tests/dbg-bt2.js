const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9302;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud58`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 300) }; return r.result.value; };
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4173/browser-tests.html" });
  await sleep(2500);
  console.log(JSON.stringify(await ev(`(async () => {
    const f = document.createElement('iframe'); document.body.append(f);
    f.src = 'about:blank?story=q1380';
    await new Promise(r => { f.onload = r; });
    const href1 = f.contentWindow.location.href;
    f.contentWindow.document.open(); f.contentWindow.document.write('<!doctype html><body data-page="qinli-play"><div id="app"></div></body>'); f.contentWindow.document.close();
    const href2 = f.contentWindow.location.href;
    const search = f.contentWindow.location.search;
    f.remove();
    return { href1, href2, search };
  })()`)));
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(1); });
