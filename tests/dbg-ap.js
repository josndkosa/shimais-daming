const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9292;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud48`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true }); if (r.exceptionDetails) return { err: JSON.stringify(r.exceptionDetails).slice(0, 200) }; return r.result.value; };
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send("Page.enable");
  for (const [url, sel] of [["http://127.0.0.1:8001/chapter.html", ".ch-next-link"], ["http://127.0.0.1:8001/cards.html?card=i3", ".topic-next"]]) {
    await send("Page.navigate", { url }); await sleep(2000);
    console.log("==", url);
    console.log(JSON.stringify(await ev(`(() => {
      const n = document.querySelector(${JSON.stringify(sel)});
      n.scrollIntoView({ block: "center" });
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const at = document.elementsFromPoint(x, y).slice(0, 4).map(e => e.tagName + "." + e.className);
      return { href: n.getAttribute("href"), target: n.target, rect: { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height) }, at, anims: document.getAnimations().length };
    })()`), null, 1));
    await sleep(2600);
    console.log("after settle:", JSON.stringify(await ev(`(() => {
      const n = document.querySelector(${JSON.stringify(sel)});
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return { rect: { x: Math.round(x), y: Math.round(y) }, at: document.elementsFromPoint(x, y).slice(0, 3).map(e => e.tagName + "." + e.className), anims: document.getAnimations().length };
    })()`)));
  }
  ws.close(); chrome.kill(); stub.kill(); process.exit(0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });
