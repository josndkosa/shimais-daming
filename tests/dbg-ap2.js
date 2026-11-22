const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9293;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud49`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
  await send("Page.navigate", { url: "http://127.0.0.1:8001/qinli.html" }); await sleep(1500);
  await ev(`localStorage.setItem("shimais-daming:progress:v1", JSON.stringify({ qinli: { current: { storyId: "q1581" } }, lastRead: { kind: "qinli", id: "q1581" } })); true`);
  await send("Page.navigate", { url: "http://127.0.0.1:8001/qinli.html" }); await sleep(1800);
  console.log(JSON.stringify(await ev(`(() => ({
    path: location.pathname + location.search,
    targeted: [...document.querySelectorAll('a[target="_blank"]')].map(a => ({ cls: a.className, href: a.getAttribute('href'), inTopic: !!a.closest('.topic-path') })),
    playBtns: document.querySelectorAll('.ql-play-btn').length,
    choices: document.querySelectorAll('.ql-choice').length
  }))()`), null, 1));
  ws.close(); chrome.kill(); stub.kill(); process.exit(0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });
