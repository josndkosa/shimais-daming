const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9265;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud27`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evalJs = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result.value;
(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); p.res(d.result); } };
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:4173/timeline.html" });
  await sleep(1200);
  for (const id of ["e1581", "e1644", "e1402"]) { await evalJs(`document.querySelector('.tl-event[data-id="${id}"] .tl-row').click()`); await sleep(150); }
  await evalJs(`document.querySelector('.tl-event[data-id="e1449"]').scrollIntoView({ block: "start", behavior: "instant" })`);
  await sleep(700); console.log("SECOND", JSON.stringify(await evalJs(`(() => { document.querySelector('.tl-event[data-id="e1449"]').scrollIntoView({ block: "start", behavior: "instant" }); return { scrollY: Math.round(scrollY), top: Math.round(document.querySelector('.tl-event[data-id="e1449"]').getBoundingClientRect().top) }; })()`))); await sleep(300); console.log("MANUAL", JSON.stringify(await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1449"]'); const doc = a.getBoundingClientRect().top + scrollY; window.scrollTo({ top: doc - 107, behavior: "instant" }); return { scrollY: Math.round(scrollY), top: Math.round(a.getBoundingClientRect().top) }; })()`))); await sleep(300); console.log("AFTER", JSON.stringify(await evalJs(`(() => ({ scrollY: Math.round(scrollY), top: Math.round(document.querySelector('.tl-event[data-id="e1449"]').getBoundingClientRect().top), line: document.querySelector('.tl-context-line').textContent }))()`)));
  console.log(JSON.stringify(await evalJs(`(() => {
    const ctx = document.querySelector('.tl-context').getBoundingClientRect();
    const ids = ['e1435','e1449','e1457'];
    return { scrollY: Math.round(scrollY), innerH: innerHeight, bodyH: document.body.scrollHeight, ctxBottom: Math.round(ctx.bottom), tops: ids.map(id => [id, Math.round(document.querySelector('.tl-event[data-id="'+id+'"]').getBoundingClientRect().top)]), heights: ids.map(id => [id, Math.round(document.querySelector('.tl-event[data-id="'+id+'"]').getBoundingClientRect().height)]), line: document.querySelector('.tl-context-line').textContent };
  })()`), null, 1));
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.error(e); chrome.kill(); process.exit(2); });
