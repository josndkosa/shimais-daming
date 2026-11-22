const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = path.join(os.tmpdir(), "shimais-check2");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9234", `--user-data-dir=${path.join(OUT, "shots-profile")}`, "about:blank"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch("http://127.0.0.1:9234/json/version"); if (r.ok) break; } catch {} await sleep(250); }
    const tab = await (await fetch("http://127.0.0.1:9234/json/new?about:blank", { method: "PUT" })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res) => (ws.onopen = res));
    let id = 0; const pending = new Map();
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
    const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
    const shot = async (name, full) => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!full }); fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(s.data, "base64")); };
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: "http://127.0.0.1:4173/" });
    await sleep(1200);
    await shot("d-index-full", true);
    await send("Page.navigate", { url: "http://127.0.0.1:4173/decisions.html" });
    await sleep(800);
    await shot("d-decisions");
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await send("Page.navigate", { url: "http://127.0.0.1:4173/profile.html" });
    await sleep(800);
    await shot("m-profile");
    ws.close();
  } finally { chrome.kill(); }
  console.log("SHOTS_OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });