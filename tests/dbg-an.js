const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9287;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud43`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const excs = []; const consoleMsgs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { evalError: JSON.stringify(r.exceptionDetails).slice(0, 500) };
  return r.result.value;
}
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") excs.push(d.params.exceptionDetails);
    else if (d.method === "Runtime.consoleAPICalled") consoleMsgs.push({ type: d.params.type, text: d.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 400) });
  };
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(600);
  await send("Page.navigate", { url: "http://127.0.0.1:8001/timeline.html" });
  await sleep(2500);
  console.log("=== EXCEPTIONS ===");
  excs.forEach((e) => {
    console.log("text:", e.text);
    console.log("exception:", JSON.stringify(e.exception).slice(0, 600));
    if (e.stackTrace) e.stackTrace.callFrames.slice(0, 8).forEach((f) => console.log("  at", f.functionName || "(anon)", f.url.split("/").pop() + ":" + (f.lineNumber + 1) + ":" + (f.columnNumber + 1)));
  });
  console.log("=== CONSOLE ===");
  consoleMsgs.forEach((m) => console.log(m.type + ":", m.text));
  console.log("=== DOM ===");
  console.log(JSON.stringify(await evalJs(`(() => ({
    rows: document.querySelectorAll('.tl-row').length,
    tmSection: !!document.querySelector('.tm-section'),
    tmStates: document.querySelectorAll('.tm-state').length,
    appChildren: document.getElementById('app').children.length,
    bodyTextLen: document.body.innerText.length
  }))()`), null, 1));
  ws.close(); chrome.kill(); stub.kill();
  process.exit(0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });