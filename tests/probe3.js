const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join(os.tmpdir(), "shimais-check2");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9231", `--user-data-dir=${path.join(OUT, "probe-profile")}`, "about:blank"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch("http://127.0.0.1:9231/json/version"); if (r.ok) break; } catch {} await sleep(250); }
    const tab = await (await fetch("http://127.0.0.1:9231/json/new?about:blank", { method: "PUT" })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res) => (ws.onopen = res));
    let id = 0; const pending = new Map();
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
    const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: "http://127.0.0.1:4173/" });
    await sleep(1000);
    const idx = () => ev(`[...document.querySelectorAll('.slide')].findIndex(s => s.classList.contains('is-active'))`);
    const state = () => ev(`({ hidden: document.hidden, hover: document.querySelector('.carousel').matches(':hover'), idx: [...document.querySelectorAll('.slide')].findIndex(s => s.classList.contains('is-active')) })`);
    console.log("t0", JSON.stringify(await state()));
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 400 });
    await sleep(300);
    console.log("enter", JSON.stringify(await state()));
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 860 });
    await sleep(300);
    console.log("leave", JSON.stringify(await state()));
    for (let i = 0; i < 8; i++) { await sleep(1000); console.log("t+" + (i + 1), JSON.stringify(await state())); }
    ws.close();
  } finally { chrome.kill(); }
})().catch((e) => { console.error("FAIL", e); process.exit(1); });