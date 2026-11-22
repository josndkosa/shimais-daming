const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9242;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud4`, "--window-size=375,720", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); } };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await send("Page.navigate", { url: "http://127.0.0.1:4173/index.html" });
  await sleep(1500);
  for (const idx of [1, 4]) {
    await evalJs(`(() => { const dots = document.querySelectorAll('.car-dot'); dots[${idx}].click(); })()`);
    await sleep(700);
    const r = await evalJs(`(() => {
      const s = document.querySelectorAll('.slide')[${idx}];
      const ink = (n) => { const rg = document.createRange(); rg.selectNodeContents(n); return rg.getBoundingClientRect(); };
      const h = ink(s.querySelector('.slide-headline')); const sub = ink(s.querySelector('.slide-sub'));
      const img = s.querySelector('img').getBoundingClientRect();
      const car = s.getBoundingClientRect();
      return { headline: s.querySelector('.slide-headline').textContent,
        copyTop: Math.round(Math.min(h.top, sub.top)), imgBottom: Math.round(img.bottom),
        subBottom: Math.round(sub.bottom), carBottom: Math.round(car.bottom),
        subRight: Math.round(sub.right), vw: window.innerWidth,
        overlap: Math.min(h.top, sub.top) < img.bottom && s.classList.contains('slide-frame') };
    })()`);
    console.log(JSON.stringify(r));
    const ok = !r.overlap && r.subRight <= r.vw && r.subBottom < r.carBottom;
    console.log(ok ? "PASS slide " + idx : "FAIL slide " + idx);
    if (!ok) process.exitCode = 1;
  }
  ws.close(); chrome.kill();
})().catch((e) => { console.error(e); chrome.kill(); process.exit(2); });