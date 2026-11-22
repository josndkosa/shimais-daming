const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9275;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud37`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-practice.js", "8001"], { stdio: "inherit" });
stub.on("exit", (c) => console.log("STUB EXIT", c));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
const FETCH_LOG = "window.__log = []; const of = window.fetch; window.fetch = async function (...a) { try { const r = await of.apply(this, a); window.__log.push([String(a[0]), r.status]); return r; } catch (e) { window.__log.push([String(a[0]), 'ERR ' + e.message]); throw e; } };";
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errs.push("EXC " + JSON.stringify(d.params.exceptionDetails).slice(0, 200));
  };
  ws.addEventListener("message", async (m) => {
    const d = JSON.parse(m.data);
    if (d.method !== "Fetch.requestPaused") return;
    const p = d.params;
    try {
      if (p.resourceType === "Document" && /\/(quiz|chat)\.html/.test(p.request.url)) {
        const b = await send("Fetch.getResponseBody", { requestId: p.requestId });
        const html = Buffer.from(b.body, b.base64Encoded ? "base64" : "utf8").toString("utf8");
        const mod = html.replace("<head>", '<head><meta name="api-base" content="http://127.0.0.1:8001">');
        const headers = (p.responseHeaders || []).filter((h) => h.name.toLowerCase() !== "content-length");
        await send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 200, responseHeaders: headers, body: Buffer.from(mod, "utf8").toString("base64") });
      } else {
        await send("Fetch.continueRequest", { requestId: p.requestId });
      }
    } catch (e) { try { await send("Fetch.continueRequest", { requestId: p.requestId }); } catch {} }
  });
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: FETCH_LOG });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Response" }] });
  await sleep(600);
  await send("Page.navigate", { url: "http://127.0.0.1:4173/quiz.html" });
  await sleep(1200);
  await evalJs(`document.querySelectorAll('.qz-mode')[1].click()`);
  await sleep(300);
  await evalJs(`document.querySelector('.qz-gen-btn').click()`);
  await sleep(1500);
  console.log("FETCHLOG", JSON.stringify(await evalJs("window.__log")));
  console.log("PANEL", JSON.stringify(await evalJs(`document.querySelector('.qz-practice-panel').textContent.slice(0, 60)`)));
  console.log("ERRS", JSON.stringify(errs));
  ws.close(); chrome.kill(); stub.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); stub.kill(); process.exit(2); });