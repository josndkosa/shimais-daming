const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = "C:/Users/刘/AppData/Local/Temp/shimais-check2/staged-al/frontend";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(ROOT, rel === "/" ? "/index.html" : rel);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(4174, "127.0.0.1");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9286;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud48`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); } else if (d.method === "Runtime.exceptionThrown") errs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200)); };
  await send("Runtime.enable"); await send("Page.enable");
  for (const p of ["timeline.html", "chat.html", "profile.html", "cards.html", "qinli.html"]) {
    await send("Page.navigate", { url: "http://127.0.0.1:4174/" + p });
    await sleep(1300);
    console.log(p, JSON.stringify(await evalJs(`({ tlRows: document.querySelectorAll('.tl-row').length, tiers: document.querySelectorAll('.ct-tier').length, forget: !!document.querySelector('.ct-forget-btn'), qinliLink: !!document.querySelector('.ct-qinli-link'), pfStats: document.querySelectorAll('.pf-stat').length, covers: document.querySelectorAll('.ql-cover').length, papers: document.querySelectorAll('.cw-paper').length })`)));
  }
  console.log("ERRS", JSON.stringify(errs));
  ws.close(); chrome.kill(); srv.close(); process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); srv.close(); process.exit(2); });
